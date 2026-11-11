import { mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises';
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

  it('reprend un verrou laissé par une incarnation précédente de même pid (conteneur redémarré)', async () => {
    const path = await lockPath();
    await writeFile(
      path,
      JSON.stringify({ pid: 7, hostname: 'conteneur', startedAt: '2020-01-01T00:00:00.000Z' }),
    );
    const lock = await acquireInstanceLock(path, { pid: 7, hostname: 'conteneur' });
    await lock.release();
  });

  it('reprend un verrou non rafraîchi depuis trop longtemps, même d’une autre machine', async () => {
    const path = await lockPath();
    await writeFile(path, JSON.stringify({ pid: 1, hostname: 'ancien-conteneur', startedAt: 'x' }));
    const old = new Date(Date.now() - 120_000);
    await utimes(path, old, old);

    const lock = await acquireInstanceLock(path, { hostname: 'nouveau-conteneur' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      hostname: 'nouveau-conteneur',
    });
    await lock.release();
  });

  it('rafraîchit le verrou tant qu’il est tenu', async () => {
    const path = await lockPath();
    const lock = await acquireInstanceLock(path, { heartbeatMs: 20 });
    const old = new Date(Date.now() - 120_000);
    await utimes(path, old, old);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(Date.now() - (await stat(path)).mtimeMs).toBeLessThan(5_000);
    await lock.release();
  });

  it('ne reprend pas un verrou récent posé depuis une autre machine', async () => {
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
