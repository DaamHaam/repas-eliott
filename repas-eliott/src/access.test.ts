import { afterEach, expect, test, vi } from 'vitest';
import { initialAccess } from './access';
afterEach(() => vi.unstubAllGlobals());
function browser(hash = '') {
  vi.stubGlobal('location', { hash, pathname: '/', search: '' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: () => 'a'.repeat(64), setItem: vi.fn() });
}
test('deux nouvelles inscriptions sur le même navigateur ont des identifiants distincts, même avec un ancien identifiant stocké', () => {
  browser(); const first = initialAccess(), second = initialAccess();
  expect(first.token).not.toBe(second.token); expect(first.token).not.toBe('a'.repeat(64));
  expect(first.editing).toBe(false); expect(second.editing).toBe(false);
});
test('les liens de deux familles sélectionnent leurs propres inscriptions et un lien invalide est signalé', () => {
  browser('#edit=' + 'b'.repeat(64)); expect(initialAccess()).toMatchObject({ token: 'b'.repeat(64), editing: true });
  browser('#edit=' + 'c'.repeat(64)); expect(initialAccess()).toMatchObject({ token: 'c'.repeat(64), editing: true });
  browser('#edit=invalide'); expect(initialAccess()).toMatchObject({ editing: false, invalidEdit: true });
});
