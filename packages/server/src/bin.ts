#!/usr/bin/env node
import { createLogger, readRuntimeOptions } from '@contextvault/core';
import { startServer } from './server.js';

const logger = createLogger('server');

try {
  const options = readRuntimeOptions();
  const server = await startServer({
    ...options,
    logger: createLogger('server', { level: options.logLevel }),
  });
  const stop = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Maintient le processus en vie en attendant le transport MCP (BC-10).
  setInterval(() => undefined, 1 << 30);
} catch (error) {
  logger.error('Démarrage du serveur impossible', { error: (error as Error).message });
  process.exit(1);
}
