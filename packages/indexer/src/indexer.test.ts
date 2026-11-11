import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@contextvault/core';
import { afterEach, describe, expect, it } from 'vitest';
import { InstanceLockedError, LOCK_FILE_NAME, startIndexer } from './index.js';

// Le binaire compilé : `npm test` lance `tsc -b` avant Vitest.
const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

async function setup(): Promise<{ configPath: string; indexDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-indexer-'));
  const configPath = join(dir, 'vaults.config.json');
  await writeFile(configPath, JSON.stringify({ version: '1', vaults: [] }));
  return { configPath, indexDir: join(dir, 'index') };
}

const silent = createLogger('indexer', { write: () => undefined });

describe('indexeur (BC-02.3)', () => {
  const children: Array<ReturnType<typeof spawn>> = [];
  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
  });

  it('ouvre le stockage en écriture et pose le verrou', async () => {
    const options = await setup();
    const indexer = await startIndexer({
      ...options,
      logLevel: 'info',
      environment: 'production',
      logger: silent,
    });
    expect(indexer.storage.mode).toBe('write');
    expect(existsSync(join(options.indexDir, LOCK_FILE_NAME))).toBe(true);
    await indexer.close();
    expect(existsSync(join(options.indexDir, LOCK_FILE_NAME))).toBe(false);
  });

  it('refuse un second indexeur et le journalise', async () => {
    const options = await setup();
    const first = await startIndexer({
      ...options,
      logLevel: 'info',
      environment: 'production',
      logger: silent,
    });
    const lines: string[] = [];
    await expect(
      startIndexer({
        ...options,
        logLevel: 'info',
        environment: 'production',
        logger: createLogger('indexer', { write: (l) => lines.push(l) }),
      }),
    ).rejects.toThrow(InstanceLockedError);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'error',
      message: 'Démarrage refusé : un autre indexeur tourne déjà',
      ownerPid: process.pid,
    });
    await first.close();
  });

  it('un second processus indexeur refuse de démarrer (code 2)', async () => {
    const options = await setup();
    const env = {
      ...process.env,
      CONTEXTVAULT_CONFIG: options.configPath,
      CONTEXTVAULT_INDEX_DIR: options.indexDir,
    };

    const first = spawn(process.execPath, [BIN], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(first);
    await new Promise<void>((resolve, reject) => {
      first.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('Indexeur démarré')) resolve();
      });
      first.once('exit', (code) => reject(new Error(`premier indexeur arrêté (code ${code})`)));
    });

    const second = spawnSync(process.execPath, [BIN], { env, encoding: 'utf8', timeout: 10_000 });
    expect(second.status).toBe(2);
    expect(second.stdout).toContain('un autre indexeur tourne déjà');

    // Arrêt propre : le verrou est libéré.
    const exited = new Promise((resolve) => first.once('exit', resolve));
    first.kill('SIGTERM');
    await exited;
    expect(existsSync(join(options.indexDir, LOCK_FILE_NAME))).toBe(false);
  });
});
