import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageReadOnlyError, createLogger, openIndexStorage } from '@contextvault/core';
import type { WritableIndexStorage } from '@contextvault/core';
import { describe, expect, it } from 'vitest';
import { startServer } from './index.js';

async function setup(): Promise<{ configPath: string; indexDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-server-'));
  const configPath = join(dir, 'vaults.config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      version: '1',
      vaults: [
        {
          id: 'client-7f3a',
          display_name: 'Client',
          source: 'git@forge:client.git',
          access_roles: ['vault-client-7f3a'],
          status: 'actif',
        },
      ],
    }),
  );
  return { configPath, indexDir: join(dir, 'index') };
}

const silent = createLogger('server', { write: () => undefined });

describe('serveur (BC-02.2)', () => {
  it('démarre avec la configuration et un stockage en lecture seule', async () => {
    const options = await setup();
    const server = await startServer({ ...options, logLevel: 'info', logger: silent });
    expect(server.config.vaults).toHaveLength(1);
    expect(server.storage.mode).toBe('read');
    await server.close();
  });

  it("lève une erreur à toute tentative d'écriture sur les index", async () => {
    const options = await setup();
    const indexer = await openIndexStorage({ kind: 'local', path: options.indexDir }, 'write');
    await indexer.writeFile('client-7f3a', 'index.sqlite', 'publié par l’indexeur');

    const server = await startServer({ ...options, logLevel: 'info', logger: silent });
    const storage = server.storage as unknown as WritableIndexStorage;
    await expect(storage.writeFile('client-7f3a', 'index.sqlite', 'x')).rejects.toThrow(
      StorageReadOnlyError,
    );
    await expect(storage.removeVault('client-7f3a')).rejects.toThrow(StorageReadOnlyError);
    expect(await server.storage.listFiles('client-7f3a')).toEqual(['index.sqlite']);
    await server.close();
  });

  it('journalise le démarrage sans contenu de document', async () => {
    const options = await setup();
    const lines: string[] = [];
    const server = await startServer({
      ...options,
      logLevel: 'info',
      logger: createLogger('server', { write: (l) => lines.push(l) }),
    });
    await server.close();
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      component: 'server',
      message: 'Serveur démarré',
      vaults: 1,
      storageMode: 'read',
    });
  });
});
