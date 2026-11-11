#!/usr/bin/env node
import { createLogger, readRuntimeOptions } from '@contextvault/core';
import { startIndexer } from './indexer.js';
import { InstanceLockedError } from './lock.js';

const logger = createLogger('indexer');

try {
  const options = readRuntimeOptions();
  const indexer = await startIndexer({
    ...options,
    logger: createLogger('indexer', { level: options.logLevel }),
  });
  // Filet de sécurité : le verrou est libéré même sur une sortie inattendue.
  process.once('exit', () => indexer.lock.releaseSync());
  const stop = (): void => {
    void indexer.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Maintient le processus en vie en attendant la boucle d'indexation (BC-30).
  setInterval(() => undefined, 1 << 30);
} catch (error) {
  // Le refus pour verrou est déjà journalisé par startIndexer.
  if (!(error instanceof InstanceLockedError)) {
    logger.error("Démarrage de l'indexeur impossible", { error: (error as Error).message });
  }
  process.exit(error instanceof InstanceLockedError ? 2 : 1);
}
