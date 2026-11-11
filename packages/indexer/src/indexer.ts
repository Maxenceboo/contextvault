/**
 * Indexeur (ET-02) : seul processus qui écrit les index, en une seule instance.
 * La synchronisation git et l'indexation FTS5 arrivent avec BC-30 et BC-31 ;
 * ce module pose le démarrage, le verrou et l'accès en écriture au stockage.
 */

import { join } from 'node:path';
import {
  createLogger,
  loadConfig,
  openIndexStorage,
  type ContextVaultConfig,
  type Logger,
  type RuntimeOptions,
  type WritableIndexStorage,
} from '@contextvault/core';
import { InstanceLockedError, acquireInstanceLock, type InstanceLock } from './lock.js';

export const LOCK_FILE_NAME = '.indexer.lock';

export interface RunningIndexer {
  readonly config: ContextVaultConfig;
  readonly storage: WritableIndexStorage;
  readonly lock: InstanceLock;
  close(): Promise<void>;
}

export interface StartIndexerOptions extends RuntimeOptions {
  readonly logger?: Logger;
}

export async function startIndexer(options: StartIndexerOptions): Promise<RunningIndexer> {
  const logger = options.logger ?? createLogger('indexer', { level: options.logLevel });
  const config = await loadConfig(options.configPath);
  const storage = await openIndexStorage({ kind: 'local', path: options.indexDir }, 'write');

  let lock: InstanceLock;
  try {
    lock = await acquireInstanceLock(join(options.indexDir, LOCK_FILE_NAME));
  } catch (error) {
    if (error instanceof InstanceLockedError) {
      logger.error('Démarrage refusé : un autre indexeur tourne déjà', {
        lockPath: error.lockPath,
        ownerPid: error.owner?.pid,
        ownerHost: error.owner?.hostname,
      });
    }
    throw error;
  }

  logger.info('Indexeur démarré', { vaults: config.vaults.length, pid: lock.owner.pid });

  return {
    config,
    storage,
    lock,
    close: async () => {
      await lock.release();
      logger.info('Indexeur arrêté');
    },
  };
}
