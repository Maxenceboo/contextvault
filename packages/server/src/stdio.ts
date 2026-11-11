/**
 * Transport stdio, réservé au développement (T10, ET-17, BC-03.3).
 * La sortie standard porte le protocole : les logs vont sur la sortie d'erreur.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Environment } from '@contextvault/core';
import { TransportNotAllowedError } from './http.js';
import { createMcpServer } from './mcp.js';
import type { RunningServer } from './server.js';

export function assertStdioAllowed(environment: Environment): void {
  if (environment !== 'development') {
    throw new TransportNotAllowedError(
      'Transport stdio refusé : il est réservé au développement (CONTEXTVAULT_ENV=development).',
    );
  }
}

export async function startStdioServer(
  context: RunningServer,
): Promise<{ close(): Promise<void> }> {
  const server = createMcpServer(context);
  await server.connect(new StdioServerTransport());
  return { close: () => server.close() };
}
