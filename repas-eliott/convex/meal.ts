import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation, env } from "./_generated/server";
import { categories } from "./categories";

const categoryView = v.object({ key: v.string(), title: v.string(), instruction: v.string(), places: v.number() });
const choicesValidator = v.array(v.object({ slotId: v.id("slots"), dish: v.string() }));
const slotView = v.object({ id: v.id("slots"), category: v.string(), position: v.number(), familyId: v.union(v.id("families"), v.null()), name: v.string(), dish: v.string() });
const familyView = v.object({ id: v.id("families"), name: v.string(), guests: v.number(), comment: v.string(), updatedAt: v.number() });

async function hash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ConvexError("Lien personnel invalide.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function checkAdmin(token: string) {
  if (await hash(token) !== env.ADMIN_TOKEN_HASH) throw new ConvexError("Accès organisateur invalide.");
}
function validateIdentity(name: string, guests: number, comment: string) {
  if (!name.trim() || name.trim().length > 80) throw new ConvexError("Indique un prénom ou un nom de famille (80 caractères maximum).");
  if (!Number.isInteger(guests) || guests < 1 || guests > 43) throw new ConvexError("Indique entre 1 et 43 personnes pour votre famille.");
  if (comment.length > 500) throw new ConvexError("Le commentaire doit rester sous 500 caractères.");
}

export const initialize = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    for (const category of categories) {
      const existing = await ctx.db.query("slots").withIndex("by_category_and_position", q => q.eq("category", category.key)).take(20);
      const settings = await ctx.db.query("categorySettings").withIndex("by_key", q => q.eq("key", category.key)).unique();
      const target = settings?.places ?? category.places;
      const next = existing.reduce((n, s) => Math.max(n, s.position + 1), 0);
      for (let i = existing.length; i < target; i++) await ctx.db.insert("slots", { category: category.key, position: next + i - existing.length, familyId: null, dish: "" });
    }
    return null;
  },
});

export const board = query({
  args: {}, returns: v.object({ categories: v.array(categoryView), slots: v.array(slotView), families: v.array(v.object({ id: v.id("families"), name: v.string(), guests: v.number() })) }),
  handler: async ctx => {
    const families = await ctx.db.query("families").withIndex("by_active", q => q.eq("active", true)).take(200);
    const slots = (await Promise.all(categories.map(c => ctx.db.query("slots").withIndex("by_category_and_position", q => q.eq("category", c.key)).take(20)))).flat();
    const settings = await ctx.db.query("categorySettings").take(10);
    const configured = categories.map(c => { const saved = settings.find(s => s.key === c.key); return { key: c.key, title: saved?.title ?? c.title, instruction: saved?.instruction ?? c.instruction, places: saved?.places ?? c.places }; });
    const names = new Map(families.map(f => [f._id, f.name]));
    return { categories: configured, slots: slots.map(s => ({ id: s._id, category: s.category, position: s.position, familyId: s.familyId, name: s.familyId ? names.get(s.familyId) ?? "Participant" : "", dish: s.dish })), families: families.map(f => ({ id: f._id, name: f.name, guests: f.guests })) };
  },
});

export const mine = query({
  args: { token: v.string() }, returns: v.union(v.null(), v.object({ family: familyView, choices: choicesValidator })),
  handler: async (ctx, { token }) => {
    // Hash the capability before looking it up; never expose it on the public board.
    const tokenHash = await hash(token);
    const f = await ctx.db.query("families").withIndex("by_tokenHash", q => q.eq("tokenHash", tokenHash)).unique();
    if (!f?.active) return null;
    const slots = await ctx.db.query("slots").withIndex("by_familyId", q => q.eq("familyId", f._id)).take(180);
    return { family: { id: f._id, name: f.name, guests: f.guests, comment: f.comment, updatedAt: f.updatedAt }, choices: slots.map(s => ({ slotId: s._id, dish: s.dish })) };
  },
});

export const save = mutation({
  args: { token: v.string(), name: v.string(), guests: v.number(), comment: v.string(), choices: choicesValidator }, returns: v.id("families"),
  handler: async (ctx, args) => {
    validateIdentity(args.name, args.guests, args.comment);
    if (args.choices.length > 180 || new Set(args.choices.map(c => c.slotId)).size !== args.choices.length) throw new ConvexError("Sélection de places invalide.");
    const tokenHash = await hash(args.token);
    const family = await ctx.db.query("families").withIndex("by_tokenHash", q => q.eq("tokenHash", tokenHash)).unique();
    // Every slot is checked and written in one transaction: concurrent claims cannot overbook.
    for (const choice of args.choices) {
      if (!choice.dish.trim() || choice.dish.trim().length > 180) throw new ConvexError("Précise ce que tu apportes (180 caractères maximum).");
      const slot = await ctx.db.get(choice.slotId);
      if (!slot || (slot.familyId && slot.familyId !== family?._id)) throw new ConvexError("Une place vient d’être prise. Le tableau a été actualisé : choisis une autre place.");
    }
    if (!family) {
      const all = await ctx.db.query("families").take(201);
      if (all.length >= 200) throw new ConvexError("Les inscriptions sont momentanément fermées. Contacte les organisateurs.");
    }
    const values = { name: args.name.trim(), guests: args.guests, comment: args.comment.trim(), active: true, updatedAt: Date.now() };
    const familyId = family?._id ?? await ctx.db.insert("families", { ...values, tokenHash });
    if (family) await ctx.db.patch(familyId, values);
    const previous = await ctx.db.query("slots").withIndex("by_familyId", q => q.eq("familyId", familyId)).take(180);
    const keep = new Set(args.choices.map(c => c.slotId));
    for (const slot of previous) if (!keep.has(slot._id)) await ctx.db.patch(slot._id, { familyId: null, dish: "" });
    for (const choice of args.choices) await ctx.db.patch(choice.slotId, { familyId, dish: choice.dish.trim() });
    return familyId;
  },
});

export const adminResults = query({
  args: { token: v.string() }, returns: v.union(v.null(), v.array(familyView)),
  handler: async (ctx, { token }) => {
    try { await checkAdmin(token); } catch { return null; }
    return (await ctx.db.query("families").withIndex("by_active", q => q.eq("active", true)).take(200)).map(f => ({ id: f._id, name: f.name, guests: f.guests, comment: f.comment, updatedAt: f.updatedAt }));
  },
});

export const adminUpdate = mutation({
  args: { token: v.string(), id: v.id("families"), name: v.string(), guests: v.number(), comment: v.string(), choices: v.optional(choicesValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    await checkAdmin(args.token); validateIdentity(args.name, args.guests, args.comment);
    const family = await ctx.db.get(args.id);
    if (!family?.active) throw new ConvexError("Cette inscription n’existe plus.");
    if (args.choices) {
      if (args.choices.length > 180) throw new ConvexError("Trop de contributions.");
      for (const c of args.choices) {
        const slot = await ctx.db.get(c.slotId);
        if (slot?.familyId !== args.id || !c.dish.trim() || c.dish.length > 180) throw new ConvexError("Contribution invalide.");
        await ctx.db.patch(c.slotId, { dish: c.dish.trim() });
      }
    }
    await ctx.db.patch(args.id, { name: args.name.trim(), guests: args.guests, comment: args.comment.trim(), updatedAt: Date.now() });
    return null;
  },
});

export const adminCancel = mutation({
  args: { token: v.string(), id: v.id("families") }, returns: v.null(),
  handler: async (ctx, args) => {
    await checkAdmin(args.token);
    const family = await ctx.db.get(args.id);
    if (!family) throw new ConvexError("Inscription introuvable.");
    const slots = await ctx.db.query("slots").withIndex("by_familyId", q => q.eq("familyId", args.id)).take(180);
    for (const s of slots) await ctx.db.patch(s._id, { familyId: null, dish: "" });
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    return null;
  },
});

export const adminConfigureCategory = mutation({
  args: { token: v.string(), key: v.string(), title: v.string(), instruction: v.string(), places: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await checkAdmin(args.token);
    if (!categories.some(c => c.key === args.key)) throw new ConvexError("Poste inconnu.");
    const title = args.title.trim(), instruction = args.instruction.trim();
    if (!title || title.length > 100 || !instruction || instruction.length > 500) throw new ConvexError("Indique un intitulé (100 caractères maximum) et une consigne (500 caractères maximum).");
    if (!Number.isInteger(args.places) || args.places < 1 || args.places > 20) throw new ConvexError("Indique entre 1 et 20 places.");
    const slots = await ctx.db.query("slots").withIndex("by_category_and_position", q => q.eq("category", args.key)).take(20);
    if (slots.filter(s => s.familyId).length > args.places) throw new ConvexError("Impossible de retirer une place déjà réservée.");
    const toRemove = Math.max(0, slots.length - args.places);
    const free = slots.filter(s => !s.familyId).reverse();
    for (const slot of free.slice(0, toRemove)) await ctx.db.delete(slot._id);
    const next = slots.reduce((n, s) => Math.max(n, s.position + 1), 0);
    for (let i = slots.length; i < args.places; i++) await ctx.db.insert("slots", { category: args.key, position: next + i - slots.length, familyId: null, dish: "" });
    const existing = await ctx.db.query("categorySettings").withIndex("by_key", q => q.eq("key", args.key)).unique();
    const values = { key: args.key, title, instruction, places: args.places };
    if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("categorySettings", values);
    return null;
  },
});
