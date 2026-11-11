import { describe, expect, it } from 'vitest';
import { isReadableStatus, isValidVaultId, levelRank } from './index.js';

describe('modèle de vault', () => {
  it('ordonne les niveaux du moins au plus sensible', () => {
    expect(levelRank('interne')).toBeLessThan(levelRank('eleve'));
    expect(levelRank('eleve')).toBeLessThan(levelRank('critique'));
  });

  it('ne sert jamais un vault archivé ou supprimé (EF-37)', () => {
    expect(isReadableStatus('actif')).toBe(true);
    expect(isReadableStatus('maintenance')).toBe(true);
    expect(isReadableStatus('prospect')).toBe(true);
    expect(isReadableStatus('archive')).toBe(false);
    expect(isReadableStatus('supprime')).toBe(false);
  });

  it.each(['_global-socle', 'client-7f3a', 'pole-data'])('accepte l’identifiant %s', (id) =>
    expect(isValidVaultId(id)).toBe(true),
  );

  it.each(['', '..', 'a/b', 'Client', '-client', '__double', 'a'.repeat(64)])(
    'refuse l’identifiant %j',
    (id) => expect(isValidVaultId(id)).toBe(false),
  );
});
