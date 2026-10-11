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
  const id = await t.mutation(api.meal.save, { token: a, ...identity, choices: [{ slotId: board.slots[0].id, dish: 'Chips' }] });
  await t.mutation(api.meal.save, { token: a, ...identity, guests: 4 });
  const after = await t.query(api.meal.board, {}); expect(after.families).toHaveLength(1); expect(after.families[0].guests).toBe(4); expect(after.slots[0].familyId).toBeNull();
  expect(await t.query(api.meal.adminResults, { token: b })).toBeNull();
  await expect(t.mutation(api.meal.adminCancel, { token: b, id })).rejects.toThrow();
  expect((await t.query(api.meal.adminResults, { token: admin }))?.[0].comment).toBe('Message privé');
  await t.mutation(api.meal.adminCancel, { token: admin, id });
  expect((await t.query(api.meal.board, {})).families).toHaveLength(0);
});
test('refuse convives fractionnaires, contributions vides et places répétées', async () => {
  const t = convexTest(schema, modules); await t.mutation(internal.meal.initialize, {});
  const board = await t.query(api.meal.board, {}); const choice = { slotId: board.slots[0].id, dish: 'Cake' };
  await expect(t.mutation(api.meal.save, { token: a, ...identity, guests: 2.5 })).rejects.toThrow();
  await expect(t.mutation(api.meal.save, { token: a, ...identity, choices: [{ ...choice, dish: ' ' }] })).rejects.toThrow();
  await expect(t.mutation(api.meal.save, { token: a, ...identity, choices: [choice, choice] })).rejects.toThrow();
});
