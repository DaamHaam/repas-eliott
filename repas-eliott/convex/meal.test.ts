/// <reference types="vite/client" />
import { expect, test, beforeEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
const a = 'a'.repeat(64), b = 'b'.repeat(64), admin = 'c'.repeat(64);
const identity = { name: 'Famille test', guests: 5, comment: 'Message privé', choices: [] };
beforeEach(async () => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(admin));
  vi.stubEnv('ADMIN_TOKEN_HASH', Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''));
});
test('18 places, prénom et nombre de convives, aucune fuite de secret ou commentaire privé', async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {});
  expect(board.slots).toHaveLength(18);
  await t.mutation(api.meal.save, { token: a, ...identity, choices: [{ slotId: board.slots[0].id, dish: 'Cake aux olives' }] });
  const updated = await t.query(api.meal.board, {});
  expect(updated.families[0].guests).toBe(5);
  expect(JSON.stringify(updated)).not.toContain('Message privé');
  expect(JSON.stringify(updated)).not.toContain('tokenHash');
  expect((await t.query(api.meal.mine, { token: a }))?.choices).toHaveLength(1);
  expect(await t.query(api.meal.mine, { token: b })).toBeNull();
});
test('refuse la double réservation sans créer de famille ni modifier les autres places', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {}); const slotId = board.slots[0].id;
  await t.mutation(api.meal.save, { token: a, ...identity, choices: [{ slotId, dish: 'Chips' }] });
  await expect(t.mutation(api.meal.save, { token: b, ...identity, choices: [{ slotId: board.slots[1].id, dish: 'Saucisson' }, { slotId, dish: 'Olives' }] })).rejects.toThrow();
  const after = await t.query(api.meal.board, {});
  expect(after.families).toHaveLength(1); expect(after.slots[1].familyId).toBeNull();
});
test('modification familiale sans doublon, libération des places et contrôle organisateur', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {});
  const { id, updatedAt } = await t.mutation(api.meal.save, { token: a, ...identity, choices: [{ slotId: board.slots[0].id, dish: 'Chips' }] });
  const edited = await t.mutation(api.meal.save, { token: a, ...identity, guests: 4, expectedUpdatedAt: updatedAt });
  const after = await t.query(api.meal.board, {}); expect(after.families).toHaveLength(1); expect(after.families[0].guests).toBe(4); expect(after.slots[0].familyId).toBeNull();
  expect(await t.query(api.meal.adminResults, { token: b })).toBeNull();
  await expect(t.mutation(api.meal.adminCancel, { token: b, id })).rejects.toThrow();
  expect((await t.query(api.meal.adminResults, { token: admin }))?.[0].comment).toBe('Message privé');
  await t.mutation(api.meal.adminCancel, { token: admin, id, expectedUpdatedAt: edited.updatedAt });
  expect((await t.query(api.meal.board, {})).families).toHaveLength(0);
});
test('refuse convives fractionnaires, contributions vides et places répétées', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {}); const choice = { slotId: board.slots[0].id, dish: 'Cake' };
  await expect(t.mutation(api.meal.save, { token: a, ...identity, guests: 2.5 })).rejects.toThrow();
  await expect(t.mutation(api.meal.save, { token: a, ...identity, choices: [{ ...choice, dish: ' ' }] })).rejects.toThrow();
  await expect(t.mutation(api.meal.save, { token: a, ...identity, choices: [choice, choice] })).rejects.toThrow();
});

test('réglages organisateur protégés, nouvelles places et réservations conservées', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const before = await t.query(api.meal.board, {});
  const dessert = before.slots.filter(s => s.category === 'dessert');
  await t.mutation(api.meal.save, { token: a, ...identity, choices: [{ slotId: dessert[2].id, dish: 'Gâteau au chocolat' }] });
  const config = { key: 'dessert', title: 'Desserts à partager', instruction: '1 à 2 gâteaux, ou l’équivalent de 12 parts chacun.', places: 4 };
  await expect(t.mutation(api.meal.adminConfigureCategory, { token: b, ...config })).rejects.toThrow();
  await t.mutation(api.meal.adminConfigureCategory, { token: admin, ...config });
  await t.mutation(internal.meal.initialize, {});
  const after = await t.query(api.meal.board, {});
  expect(after.slots.filter(s => s.category === 'dessert')).toHaveLength(4);
  expect(after.categories.find(c => c.key === 'dessert')).toEqual(config);
  expect(after.slots.find(s => s.id === dessert[2].id)?.dish).toBe('Gâteau au chocolat');
  await t.mutation(api.meal.adminConfigureCategory, { token: admin, ...config, places: 1 });
  const reduced = (await t.query(api.meal.board, {})).slots.filter(s => s.category === 'dessert');
  expect(reduced).toHaveLength(1); expect(reduced[0].id).toBe(dessert[2].id);
  await expect(t.mutation(api.meal.adminConfigureCategory, { token: admin, ...config, places: 0 })).rejects.toThrow();
});

test('impossible de réduire sous les réservations ; contributions au-delà des 18 places initiales', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const config = { token: admin, key: 'aperitif', title: 'Apéritif', instruction: 'Pour 15 personnes chacune.', places: 20 };
  await t.mutation(api.meal.adminConfigureCategory, config);
  const slots = (await t.query(api.meal.board, {})).slots.filter(s => s.category === 'aperitif');
  await t.mutation(api.meal.save, { token: a, ...identity, choices: slots.slice(0, 19).map(s => ({ slotId: s.id, dish: 'Olives' })) });
  await expect(t.mutation(api.meal.adminConfigureCategory, { ...config, title: 'Ne doit pas changer', places: 18 })).rejects.toThrow();
  const after = await t.query(api.meal.board, {});
  expect(after.categories.find(c => c.key === 'aperitif')?.title).toBe('Apéritif');
  expect(after.slots.filter(s => s.category === 'aperitif')).toHaveLength(20);
});

test('deux familles distinctes restent inscrites et une nouvelle inscription ne peut remplacer une famille existante', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {});
  const first = await t.mutation(api.meal.save, { token: a, ...identity, name: 'Première famille', choices: [{ slotId: board.slots[0].id, dish: 'Olives' }] });
  const second = await t.mutation(api.meal.save, { token: b, ...identity, name: 'Maman', choices: [{ slotId: board.slots[1].id, dish: 'Chips' }] });
  expect(first.id).not.toBe(second.id);
  await expect(t.mutation(api.meal.save, { token: a, ...identity, name: 'Autre famille', expectedUpdatedAt: null })).rejects.toThrow();
  expect((await t.query(api.meal.mine, { token: a }))?.family.name).toBe('Première famille');
  expect((await t.query(api.meal.mine, { token: b }))?.family.name).toBe('Maman');
  expect((await t.query(api.meal.board, {})).families).toHaveLength(2);
});

test('retirer une seule contribution conserve famille, convives et autre contribution ; une autre famille peut reprendre la place', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {});
  const choices = board.slots.slice(0, 2).map((s, i) => ({ slotId: s.id, dish: i ? 'Chips' : 'Olives' }));
  const first = await t.mutation(api.meal.save, { token: a, ...identity, choices });
  await t.mutation(api.meal.adminUpdate, { token: admin, id: first.id, expectedUpdatedAt: first.updatedAt, ...identity, choices: [choices[1]] });
  const mine = await t.query(api.meal.mine, { token: a });
  expect(mine?.family.guests).toBe(5); expect(mine?.choices).toEqual([choices[1]]);
  expect((await t.query(api.meal.board, {})).slots[0].familyId).toBeNull();
  await t.mutation(api.meal.save, { token: b, ...identity, choices: [choices[0]] });
  await t.mutation(api.meal.adminUpdate, { token: admin, id: first.id, expectedUpdatedAt: mine!.family.updatedAt, ...identity, choices: [] });
  expect((await t.query(api.meal.mine, { token: a }))?.choices).toEqual([]);
  expect((await t.query(api.meal.board, {})).families).toHaveLength(2);
});

test('ancien formulaire invité ou organisateur refusé sans écrasement ; une inscription annulée ne peut être réactivée', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const first = await t.mutation(api.meal.save, { token: a, ...identity });
  await t.mutation(api.meal.adminUpdate, { token: admin, id: first.id, expectedUpdatedAt: first.updatedAt, ...identity, guests: 3 });
  await expect(t.mutation(api.meal.save, { token: a, ...identity, expectedUpdatedAt: first.updatedAt })).rejects.toThrow();
  await expect(t.mutation(api.meal.adminUpdate, { token: admin, id: first.id, expectedUpdatedAt: first.updatedAt, ...identity })).rejects.toThrow();
  await expect(t.mutation(api.meal.adminCancel, { token: admin, id: first.id, expectedUpdatedAt: first.updatedAt })).rejects.toThrow();
  const latest = await t.query(api.meal.mine, { token: a }); expect(latest?.family.guests).toBe(3);
  await t.mutation(api.meal.adminCancel, { token: admin, id: first.id, expectedUpdatedAt: latest!.family.updatedAt });
  await expect(t.mutation(api.meal.save, { token: a, ...identity, expectedUpdatedAt: latest!.family.updatedAt })).rejects.toThrow();
  expect(await t.query(api.meal.mine, { token: a })).toBeNull();
});
