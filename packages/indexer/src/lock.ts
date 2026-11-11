/**
 * Verrou d'instance unique de l'indexeur (ET-02, BC-02.3).
 *
 * Fichier créé de façon exclusive (`wx`) dans le dossier des index. Le
 * propriétaire rafraîchit sa date de modification à intervalle régulier.
 * Un verrou est repris s'il est abandonné :
 * - posé sur la même machine par un processus qui n'existe plus (ou par un
 *   processus de même pid, cas d'un conteneur redémarré) ;
 * - ou non rafraîchi depuis `staleAfterMs`, quelle que soit la machine (cas
 *   d'un conteneur recréé, dont le nom d'hôte change).
 * Sinon, le démarrage est refusé.
 */

import { readFileSync, rmSync } from 'node:fs';
import { open, readFile, rm, stat, utimes } from 'node:fs/promises';
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

function processStartedAt(): number {
  return Date.now() - process.uptime() * 1000;
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
  /** Intervalle de rafraîchissement du verrou (10 s par défaut). */
  readonly heartbeatMs?: number;
  /** Au-delà, un verrou non rafraîchi est abandonné (60 s par défaut). */
  readonly staleAfterMs?: number;
}

export const DEFAULT_HEARTBEAT_MS = 10_000;
export const DEFAULT_STALE_AFTER_MS = 60_000;

export async function acquireInstanceLock(
  path: string,
  options: AcquireOptions = {},
): Promise<InstanceLock> {
  const now = options.now ?? (() => new Date());
  const owner: LockOwner = {
    pid: options.pid ?? process.pid,
    hostname: options.hostname ?? hostname(),
    startedAt: now().toISOString(),
  };
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify(owner));
      } finally {
        await handle.close();
      }
      const heartbeat = setInterval(() => {
        if (!isOurs(path, owner)) return;
        const date = now();
        utimes(path, date, date).catch(() => undefined);
      }, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
      heartbeat.unref();
      return {
        path,
        owner,
        release: async () => {
          clearInterval(heartbeat);
          if (isOurs(path, owner)) await rm(path, { force: true });
        },
        releaseSync: () => {
          clearInterval(heartbeat);
          if (isOurs(path, owner)) rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const existing = parseOwner(await readFile(path, 'utf8').catch(() => ''));
    const modified = await stat(path).then(
      (s) => s.mtimeMs,
      () => 0,
    );
    const sameHost = existing !== undefined && existing.hostname === owner.hostname;
    // Même pid mais verrou posé avant le démarrage de ce processus : c'est une
    // incarnation précédente (conteneur redémarré), pas nous.
    const previousIncarnation =
      sameHost && existing.pid === owner.pid && Date.parse(existing.startedAt) < processStartedAt();
    const stale =
      now().getTime() - modified > staleAfterMs ||
      previousIncarnation ||
      (sameHost && existing.pid !== owner.pid && !isAlive(existing.pid));
    if (!stale || attempt > 0) throw new InstanceLockedError(path, existing);
    await rm(path, { force: true });
  }
  throw new InstanceLockedError(path, undefined);
}
