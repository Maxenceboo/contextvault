/**
 * Verrou d'instance unique de l'indexeur (ET-02, BC-02.3).
 *
 * Fichier créé de façon exclusive (`wx`) dans le dossier des index. Un verrou
 * laissé par un indexeur mort sur la même machine est repris ; un verrou tenu
 * par un processus vivant, ou posé depuis une autre machine, bloque le démarrage.
 */

import { readFileSync, rmSync } from 'node:fs';
import { open, readFile, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { ContextVaultError } from '@contextvault/core';

export interface LockOwner {
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: string;
}

export class InstanceLockedError extends ContextVaultError {
  constructor(
    readonly lockPath: string,
    readonly owner: LockOwner | undefined,
  ) {
    super(
      'INDEXER_ALREADY_RUNNING',
      owner
        ? `Un indexeur tourne déjà (pid ${owner.pid} sur ${owner.hostname}, depuis ${owner.startedAt}). Verrou : ${lockPath}`
        : `Un indexeur tourne déjà (verrou illisible : ${lockPath})`,
    );
  }
}

export interface InstanceLock {
  readonly path: string;
  readonly owner: LockOwner;
  /** Libère le verrou s'il nous appartient encore. */
  release(): Promise<void>;
  /** Variante synchrone pour le gestionnaire `exit`. */
  releaseSync(): void;
}

function parseOwner(text: string): LockOwner | undefined {
  try {
    const value = JSON.parse(text) as Partial<LockOwner>;
    if (typeof value.pid === 'number' && typeof value.hostname === 'string') {
      return { pid: value.pid, hostname: value.hostname, startedAt: String(value.startedAt) };
    }
  } catch {
    // Contenu illisible : traité comme un verrou tenu.
  }
  return undefined;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM : le processus existe mais appartient à un autre utilisateur.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isOurs(path: string, owner: LockOwner): boolean {
  try {
    const current = parseOwner(readFileSync(path, 'utf8'));
    return current?.pid === owner.pid && current.hostname === owner.hostname;
  } catch {
    return false;
  }
}

export interface AcquireOptions {
  readonly pid?: number;
  readonly hostname?: string;
  readonly now?: () => Date;
}

export async function acquireInstanceLock(
  path: string,
  options: AcquireOptions = {},
): Promise<InstanceLock> {
  const owner: LockOwner = {
    pid: options.pid ?? process.pid,
    hostname: options.hostname ?? hostname(),
    startedAt: (options.now ?? (() => new Date()))().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify(owner));
      } finally {
        await handle.close();
      }
      return {
        path,
        owner,
        release: async () => {
          if (isOurs(path, owner)) await rm(path, { force: true });
        },
        releaseSync: () => {
          if (isOurs(path, owner)) rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const existing = parseOwner(await readFile(path, 'utf8').catch(() => ''));
    const stale =
      existing !== undefined && existing.hostname === owner.hostname && !isAlive(existing.pid);
    if (!stale || attempt > 0) throw new InstanceLockedError(path, existing);
    await rm(path, { force: true });
  }
  throw new InstanceLockedError(path, undefined);
}
