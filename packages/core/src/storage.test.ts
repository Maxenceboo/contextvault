import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InvalidStoragePathError,
  StorageNotFoundError,
  StorageReadOnlyError,
  openIndexStorage,
  type WritableIndexStorage,
} from './index.js';

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cv-storage-'));
}

describe('stockage local en écriture', () => {
  it('écrit, liste, relit et supprime les fichiers d’un vault', async () => {
    const root = join(await tempDir(), 'index');
    const storage = await openIndexStorage({ kind: 'local', path: root }, 'write');
    await storage.writeFile('client-7f3a', 'index.sqlite', 'contenu');
    await storage.writeFile('_global-socle', 'index.sqlite', new Uint8Array([1, 2, 3]));

    expect(await storage.listVaults()).toEqual(['_global-socle', 'client-7f3a']);
    expect(await storage.listFiles('client-7f3a')).toEqual(['index.sqlite']);
    expect(new TextDecoder().decode(await storage.readFile('client-7f3a', 'index.sqlite'))).toBe(
      'contenu',
    );
    // Écriture atomique : aucun fichier temporaire ne reste.
    expect(await readdir(join(root, 'client-7f3a'))).toEqual(['index.sqlite']);

    await storage.removeFile('client-7f3a', 'index.sqlite');
    await expect(storage.readFile('client-7f3a', 'index.sqlite')).rejects.toThrow(
      StorageNotFoundError,
    );
    await storage.removeVault('_global-socle');
    expect(await storage.listVaults()).toEqual(['client-7f3a']);
  });

  it.each([
    ['../autre', 'index.sqlite'],
    ['client-7f3a', '../../etc/passwd'],
    ['client-7f3a', 'sous/dossier'],
    ['client-7f3a', '..'],
    ['Client', 'index.sqlite'],
  ])('refuse le chemin %s/%s', async (vaultId, file) => {
    const storage = await openIndexStorage({ kind: 'local', path: await tempDir() }, 'write');
    await expect(storage.writeFile(vaultId, file, 'x')).rejects.toThrow(InvalidStoragePathError);
    await expect(storage.readFile(vaultId, file)).rejects.toThrow(InvalidStoragePathError);
  });
});

describe('stockage local en lecture (serveur)', () => {
  it('lit ce que l’indexeur a écrit', async () => {
    const root = await tempDir();
    const writer = await openIndexStorage({ kind: 'local', path: root }, 'write');
    await writer.writeFile('client-7f3a', 'index.sqlite', 'v1');

    const reader = await openIndexStorage({ kind: 'local', path: root }, 'read');
    expect(reader.mode).toBe('read');
    expect(await reader.listVaults()).toEqual(['client-7f3a']);
    expect(await reader.readFile('client-7f3a', 'index.sqlite')).toEqual(
      new TextEncoder().encode('v1'),
    );
  });

  it('accepte un dossier pas encore publié', async () => {
    const reader = await openIndexStorage(
      { kind: 'local', path: join(await tempDir(), 'absent') },
      'read',
    );
    expect(await reader.listVaults()).toEqual([]);
    expect(await reader.listFiles('client-7f3a')).toEqual([]);
  });

  it('lève StorageReadOnlyError sur toute tentative d’écriture', async () => {
    const root = await tempDir();
    const writer = await openIndexStorage({ kind: 'local', path: root }, 'write');
    await writer.writeFile('client-7f3a', 'index.sqlite', 'v1');

    // Le typage interdit déjà ces appels ; on force pour vérifier la garde à l'exécution.
    const reader = (await openIndexStorage(
      { kind: 'local', path: root },
      'read',
    )) as unknown as WritableIndexStorage;
    await expect(reader.writeFile('client-7f3a', 'index.sqlite', 'pirate')).rejects.toThrow(
      StorageReadOnlyError,
    );
    await expect(reader.removeFile('client-7f3a', 'index.sqlite')).rejects.toThrow(
      StorageReadOnlyError,
    );
    await expect(reader.removeVault('client-7f3a')).rejects.toThrow(StorageReadOnlyError);
    expect(await writer.readFile('client-7f3a', 'index.sqlite')).toEqual(
      new TextEncoder().encode('v1'),
    );
  });
});
