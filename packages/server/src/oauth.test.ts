import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { createLogger } from '@contextvault/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OAuthConfigError,
  protectedResourceMetadata,
  readOAuthOptions,
  startHttpServer,
  startServer,
  type OAuthOptions,
  type RunningHttpServer,
  type RunningServer,
} from './index.js';
import { writeTestConfig } from './testing.js';

const ISSUER = 'https://sso.entreprise.example/realms/contextvault';
const silent = createLogger('server', { write: () => undefined });

describe('readOAuthOptions', () => {
  it('lit émetteur, URL publique et portées', () => {
    expect(
      readOAuthOptions('production', {
        CONTEXTVAULT_OIDC_ISSUER: ISSUER,
        CONTEXTVAULT_PUBLIC_URL: 'https://contextvault.entreprise.example/',
        CONTEXTVAULT_OIDC_SCOPES: 'openid, profile',
      }),
    ).toEqual({
      issuer: ISSUER,
      publicUrl: 'https://contextvault.entreprise.example',
      scopes: ['openid', 'profile'],
    });
  });

  it('renvoie undefined sans configuration OIDC', () => {
    expect(readOAuthOptions('development', {})).toBeUndefined();
  });

  it('exige les deux variables ensemble', () => {
    expect(() => readOAuthOptions('production', { CONTEXTVAULT_OIDC_ISSUER: ISSUER })).toThrow(
      /CONTEXTVAULT_PUBLIC_URL/,
    );
    expect(() =>
      readOAuthOptions('production', { CONTEXTVAULT_PUBLIC_URL: 'https://cv.example' }),
    ).toThrow(/CONTEXTVAULT_OIDC_ISSUER/);
  });

  it('exige https, sauf localhost en développement', () => {
    const local = {
      CONTEXTVAULT_OIDC_ISSUER: 'http://localhost:8081/realms/contextvault',
      CONTEXTVAULT_PUBLIC_URL: 'http://localhost:8080',
    };
    expect(readOAuthOptions('development', local)?.issuer).toBe(
      'http://localhost:8081/realms/contextvault',
    );
    expect(() => readOAuthOptions('production', local)).toThrow(OAuthConfigError);
    expect(() =>
      readOAuthOptions('development', {
        ...local,
        CONTEXTVAULT_OIDC_ISSUER: 'http://sso.entreprise.example/realms/x',
      }),
    ).toThrow(/https/);
  });

  it.each([
    'pas une url',
    'https://user:secret@sso.example/realms/x',
    'https://sso.example/realms/x?a=1',
    'https://sso.example/realms/x#frag',
  ])('refuse l’émetteur %s', (issuer) => {
    expect(() =>
      readOAuthOptions('production', {
        CONTEXTVAULT_OIDC_ISSUER: issuer,
        CONTEXTVAULT_PUBLIC_URL: 'https://cv.example',
      }),
    ).toThrow(OAuthConfigError);
  });
});

describe('métadonnées de ressource protégée (BC-10.1)', () => {
  let context: RunningServer | undefined;
  let http: RunningHttpServer | undefined;

  afterEach(async () => {
    await http?.close();
    await context?.close();
    http = undefined;
    context = undefined;
  });

  async function start(oauth?: (url: string) => OAuthOptions): Promise<string> {
    context = await startServer({
      ...(await writeTestConfig()),
      logLevel: 'info',
      environment: 'development',
      logger: silent,
    });
    // L'URL publique dépend du port choisi : premier démarrage pour l'obtenir.
    http = await startHttpServer(context, { host: '127.0.0.1', port: 0 }, silent);
    if (oauth) {
      const url = http.url;
      const port = Number(new URL(url).port);
      await http.close();
      http = undefined;
      http = await startHttpServer(context, { host: '127.0.0.1', port, oauth: oauth(url) }, silent);
    }
    return http.url;
  }

  it('un client MCP découvre l’émetteur OIDC automatiquement', async () => {
    const base = await start((url) => ({ issuer: ISSUER, publicUrl: url, scopes: [] }));
    const metadata = await discoverOAuthProtectedResourceMetadata(`${base}/mcp`);
    expect(metadata.authorization_servers).toEqual([ISSUER]);
    expect(metadata.resource).toBe(`${base}/mcp`);
    expect(metadata.bearer_methods_supported).toEqual(['header']);
  });

  it('sert les métadonnées à la racine et avec le suffixe /mcp, lisibles par un navigateur', async () => {
    const base = await start((url) => ({ issuer: ISSUER, publicUrl: url, scopes: ['openid'] }));
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(await res.json()).toMatchObject({ scopes_supported: ['openid'] });
    }
    const preflight = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`, {
      method: 'OPTIONS',
    });
    expect(preflight.status).toBe(204);
    const post = await fetch(`${base}/.well-known/oauth-protected-resource`, {
      method: 'POST',
    });
    expect(post.status).toBe(405);
  });

  it('répond 404 quand aucun émetteur n’est configuré', async () => {
    const base = await start();
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(404);
  });

  it('n’annonce les portées que si elles sont configurées', () => {
    const metadata = protectedResourceMetadata({
      issuer: ISSUER,
      publicUrl: 'https://cv.example',
      scopes: [],
    });
    expect(metadata).toEqual({
      resource: 'https://cv.example/mcp',
      authorization_servers: [ISSUER],
      bearer_methods_supported: ['header'],
      resource_name: 'ContextVault',
    });
  });
});
