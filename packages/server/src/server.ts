/**
 * Serveur MCP (ET-02) : sans état, plusieurs instances possibles, et sans
 * aucun droit d'écriture sur les index. Le transport MCP et les outils
 * arrivent avec BC-10 et BC-40 ; ce module pose le démarrage et l'accès
 * en lecture seule au stockage.
 */

import {
  createLogger,
  loadConfig,
  openIndexStorage,
  type ContextVaultConfig,
  type Logger,
  type ReadableIndexStorage,
  type RuntimeOptions,
} from '@contextvault/core';

export interface RunningServer {
  readonly config: ContextVaultConfig;
  /** Stockage ouvert en lecture : toute écriture lève `StorageReadOnlyError`. */
  readonly storage: ReadableIndexStorage;
  close(): Promise<void>;
}

export interface StartServerOptions extends RuntimeOptions {
  readonly logger?: Logger;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const logger = options.logger ?? createLogger('server', { level: options.logLevel });
  const config = await loadConfig(options.configPath);
  const storage = await openIndexStorage({ kind: 'local', path: options.indexDir }, 'read');
  const published = await storage.listVaults();

  logger.info('Serveur démarré', {
    vaults: config.vaults.length,
    publishedIndexes: published.length,
    storageMode: storage.mode,
  });

  return {
    config,
    storage,
    close: async () => {
      logger.info('Serveur arrêté');
    },
  };
}
