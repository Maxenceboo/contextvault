/**
 * Transport MCP HTTP « streamable », sans session (T10, ET-17).
 *
 * - `POST /mcp` : requêtes MCP. `GET` et `DELETE` renvoient 405 (pas de
 *   session ni de flux SSE côté serveur).
 * - `GET /healthz` : le processus répond.
 * - `GET /readyz` : configuration chargée et stockage ouvert.
 * - `GET /.well-known/oauth-protected-resource[/mcp]` : métadonnées OAuth
 *   (RFC 9728, BC-10.1), si un émetteur OIDC est configuré.
 *
 * L'authentification OIDC arrive avec BC-10 ; d'ici là le transport HTTP
 * n'est accepté qu'en environnement `development` (voir `assertHttpAllowed`).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ContextVaultError, type Environment, type Logger } from '@contextvault/core';
import { createMcpServer } from './mcp.js';
import {
  MCP_PATH,
  protectedResourceMetadata,
  protectedResourceMetadataPaths,
  type OAuthOptions,
} from './oauth.js';
import type { RunningServer } from './server.js';

/** Taille maximale d'une requête MCP (garde-fou T10). */
export const MAX_REQUEST_BYTES = 1024 * 1024;

export class TransportNotAllowedError extends ContextVaultError {
  constructor(message: string) {
    super('TRANSPORT_NOT_ALLOWED', message);
  }
}

export function assertHttpAllowed(environment: Environment): void {
  if (environment !== 'development') {
    throw new TransportNotAllowedError(
      "Transport HTTP refusé hors développement : l'authentification OIDC (BC-10) n'est pas encore livrée. Définir CONTEXTVAULT_ENV=development pour un usage local.",
    );
  }
}

export interface HttpOptions {
  readonly host: string;
  readonly port: number;
  /** Absent : aucun émetteur annoncé (développement sans SSO). */
  readonly oauth?: OAuthOptions;
}

export function readHttpOptions(env: NodeJS.ProcessEnv = process.env): HttpOptions {
  const port = Number(env['CONTEXTVAULT_PORT'] ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ContextVaultError(
      'CONFIG_INVALID',
      `CONTEXTVAULT_PORT invalide : ${env['CONTEXTVAULT_PORT']}`,
    );
  }
  return { host: env['CONTEXTVAULT_HOST'] ?? '127.0.0.1', port };
}

class PayloadTooLargeError extends Error {}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new PayloadTooLargeError();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

/** Erreur JSON-RPC neutre (RG-03) : jamais de détail interne. */
function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  context: RunningServer,
  logger: Logger,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    jsonRpcError(res, 405, -32000, 'Méthode non autorisée');
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      jsonRpcError(res, 413, -32600, 'Requête trop volumineuse');
    else jsonRpcError(res, 400, -32700, 'JSON invalide');
    return;
  }

  const server = createMcpServer(context);
  const transport = new StreamableHTTPServerTransport({
    // Sans `sessionIdGenerator` : mode sans session (T10).
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    logger.error('Erreur de traitement MCP', { error: (error as Error).name });
    if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Erreur interne');
  }
}

/**
 * Métadonnées publiques : lisibles depuis n'importe quelle origine, pour les
 * clients MCP qui tournent dans un navigateur.
 */
function serveMetadata(
  req: IncomingMessage,
  res: ServerResponse,
  metadata: ReturnType<typeof protectedResourceMetadata> | undefined,
): void {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', 'mcp-protocol-version');
    res.writeHead(204).end();
  } else if (req.method !== 'GET') {
    res.setHeader('allow', 'GET, OPTIONS');
    sendJson(res, 405, { error: 'method_not_allowed' });
  } else if (!metadata) {
    sendJson(res, 404, { error: 'not_found' });
  } else {
    res.setHeader('cache-control', 'public, max-age=3600');
    sendJson(res, 200, metadata);
  }
}

export interface RunningHttpServer {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}

export async function startHttpServer(
  context: RunningServer,
  options: HttpOptions,
  logger: Logger,
): Promise<RunningHttpServer> {
  const metadataPaths = new Set(protectedResourceMetadataPaths());
  const metadata = options.oauth ? protectedResourceMetadata(options.oauth) : undefined;

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (metadataPaths.has(path)) {
      serveMetadata(req, res, metadata);
    } else if (path === MCP_PATH) {
      void handleMcp(req, res, context, logger);
    } else if (path === '/healthz' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
    } else if (path === '/readyz' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ready', vaults: context.config.vaults.length });
    } else {
      sendJson(res, 404, { error: 'not_found' });
    }
  });
  server.requestTimeout = 30_000;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const url = `http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`;
  logger.info('Transport HTTP MCP prêt', {
    url: `${url}${MCP_PATH}`,
    oidcIssuer: options.oauth?.issuer ?? null,
  });
  if (!options.oauth) {
    logger.warn('Aucun émetteur OIDC configuré : les clients ne peuvent pas découvrir le SSO');
  }

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
