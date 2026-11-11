import { createLogger } from '@contextvault/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONNECTION_INSTRUCTIONS,
  MAX_REQUEST_BYTES,
  TransportNotAllowedError,
  assertHttpAllowed,
  readHttpOptions,
  startHttpServer,
  startServer,
  type RunningHttpServer,
  type RunningServer,
} from './index.js';
import { writeTestConfig } from './testing.js';

const silent = createLogger('server', { write: () => undefined });
const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

describe('transport HTTP', () => {
  let context: RunningServer;
  let http: RunningHttpServer;

  beforeEach(async () => {
    const options = await writeTestConfig();
    context = await startServer({
      ...options,
      logLevel: 'info',
      environment: 'development',
      logger: silent,
    });
    http = await startHttpServer(context, { host: '127.0.0.1', port: 0 }, silent);
  });

  afterEach(async () => {
    await http.close();
    await context.close();
  });

  const rpc = (body: unknown): Promise<Response> =>
    fetch(`${http.url}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify(body) });

  it('répond à initialize avec le nom du serveur et les instructions de connexion', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result['serverInfo']).toMatchObject({ name: 'contextvault' });
    expect(body.result['instructions']).toBe(CONNECTION_INSTRUCTIONS);
    // Mode sans session : aucun identifiant de session n'est émis.
    expect(res.headers.get('mcp-session-id')).toBeNull();
  });

  it("n'expose encore aucun outil", async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(await res.json()).toMatchObject({ result: { tools: [] } });
  });

  it('refuse GET et DELETE sur /mcp (pas de session ni de flux SSE)', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(`${http.url}/mcp`, { method, headers: MCP_HEADERS });
      expect(res.status).toBe(405);
    }
  });

  it('refuse une requête trop volumineuse ou mal formée', async () => {
    const big = await fetch(`${http.url}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: 'x'.repeat(MAX_REQUEST_BYTES + 1),
    });
    expect(big.status).toBe(413);

    const bad = await fetch(`${http.url}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: '{ pas du json',
    });
    expect(bad.status).toBe(400);
  });

  it('expose les sondes de vie et de disponibilité', async () => {
    expect((await fetch(`${http.url}/healthz`)).status).toBe(200);
    expect(await (await fetch(`${http.url}/readyz`)).json()).toEqual({
      status: 'ready',
      vaults: 1,
    });
    expect((await fetch(`${http.url}/inconnu`)).status).toBe(404);
  });
});

describe('garde-fous du transport HTTP', () => {
  it('refuse HTTP sans authentification hors développement (en attendant BC-10)', () => {
    expect(() => assertHttpAllowed('production')).toThrow(TransportNotAllowedError);
    expect(() => assertHttpAllowed('development')).not.toThrow();
  });

  it('lit hôte et port, avec 127.0.0.1:8080 par défaut', () => {
    expect(readHttpOptions({})).toEqual({ host: '127.0.0.1', port: 8080 });
    expect(readHttpOptions({ CONTEXTVAULT_HOST: '0.0.0.0', CONTEXTVAULT_PORT: '9000' })).toEqual({
      host: '0.0.0.0',
      port: 9000,
    });
    expect(() => readHttpOptions({ CONTEXTVAULT_PORT: 'abc' })).toThrow(/CONTEXTVAULT_PORT/);
  });
});
