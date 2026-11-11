import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InstanceLockedError, acquireInstanceLock } from './index.js';

async function lockPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'cv-lock-')), '.indexer.lock');
}

describe("verrou d'instance unique (BC-02.3)", () => {
  it('refuse un second verrou tant que le premier est tenu', async () => {
    const path = await lockPath();
    const first = await acquireInstanceLock(path);
    await expect(acquireInstanceLock(path)).rejects.toThrow(InstanceLockedError);

    await first.release();
    expect(existsSync(path)).toBe(false);
    const second = await acquireInstanceLock(path);
    await second.release();
  });

  it('indique le propriétaire du verrou dans l’erreur', async () => {
    const path = await lockPath();
    const first = await acquireInstanceLock(path);
    const error = await acquireInstanceLock(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InstanceLockedError);
    expect((error as InstanceLockedError).owner?.pid).toBe(process.pid);
    expect((error as InstanceLockedError).code).toBe('INDEXER_ALREADY_RUNNING');
    await first.release();
  });

  it("reprend le verrou d'un indexeur mort sur la même machine", async () => {
    const path = await lockPath();
    const deadPid = 2 ** 22 + 12345; // au-delà de pid_max par défaut : aucun processus.
    await writeFile(path, JSON.stringify({ pid: deadPid, hostname: 'machine-a', startedAt: 'x' }));

    const lock = await acquireInstanceLock(path, { hostname: 'machine-a' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ pid: process.pid });
    await lock.release();
  });

  it('ne reprend pas un verrou posé depuis une autre machine', async () => {
    const path = await lockPath();
    await writeFile(path, JSON.stringify({ pid: 1, hostname: 'machine-b', startedAt: 'x' }));
    await expect(acquireInstanceLock(path, { hostname: 'machine-a' })).rejects.toThrow(
      InstanceLockedError,
    );
  });

  it('considère un verrou illisible comme tenu', async () => {
    const path = await lockPath();
    await writeFile(path, 'corrompu');
    await expect(acquireInstanceLock(path)).rejects.toThrow(InstanceLockedError);
  });

  it('ne supprime pas un verrou qui ne lui appartient plus', async () => {
    const path = await lockPath();
    const lock = await acquireInstanceLock(path);
    await writeFile(path, JSON.stringify({ pid: 42, hostname: 'autre', startedAt: 'x' }));
    await lock.release();
    expect(existsSync(path)).toBe(true);
  });
});
