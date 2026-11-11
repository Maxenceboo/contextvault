#!/usr/bin/env node
/**
 * contextvault-server [--stdio]
 *
 * Par défaut : transport HTTP sur CONTEXTVAULT_HOST:CONTEXTVAULT_PORT.
 * `--stdio` : transport stdio, refusé hors CONTEXTVAULT_ENV=development.
 */
import { createLogger, readRuntimeOptions } from '@contextvault/core';
import { assertHttpAllowed, readHttpOptions, startHttpServer } from './http.js';
import { startServer } from './server.js';
import { assertStdioAllowed, startStdioServer } from './stdio.js';

const stdio = process.argv.includes('--stdio');
// En stdio, la sortie standard est réservée au protocole MCP.
const write = (line: string): boolean =>
  stdio ? process.stderr.write(line) : process.stdout.write(line);

let logger = createLogger('server', { write });

try {
  const options = readRuntimeOptions();
  logger = createLogger('server', { level: options.logLevel, write });

  // Vérifié avant tout chargement : un transport refusé ne démarre rien.
  if (stdio) assertStdioAllowed(options.environment);
  else assertHttpAllowed(options.environment);

  const server = await startServer({ ...options, logger });
  const transport = stdio
    ? await startStdioServer(server)
    : await startHttpServer(server, readHttpOptions(), logger);

  const stop = (): void => {
    void transport
      .close()
      .then(() => server.close())
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  logger.error('Démarrage du serveur impossible', { error: (error as Error).message });
  process.exit(1);
}
