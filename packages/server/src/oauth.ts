/**
 * Métadonnées OAuth du serveur MCP (RFC 9728, BC-10.1, T11).
 *
 * Le serveur est un serveur de ressources OAuth : il n'émet aucun jeton. Il
 * publie l'émetteur OIDC de l'entreprise pour que le client MCP le découvre
 * seul et lance le flux de connexion SSO. Vérification des jetons : BC-10.2.
 */

import { ContextVaultError, type Environment } from '@contextvault/core';

/** Chemin MCP servi par le serveur (voir http.ts). */
export const MCP_PATH = '/mcp';
export const PROTECTED_RESOURCE_WELL_KNOWN = '/.well-known/oauth-protected-resource';

export interface OAuthOptions {
  /** Émetteur OIDC de l'entreprise (`iss` des jetons). */
  readonly issuer: string;
  /** URL publique du serveur, telle que la voient les clients (sans `/mcp`). */
  readonly publicUrl: string;
  /** Portées annoncées aux clients, si l'annuaire en exige. */
  readonly scopes: readonly string[];
}

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly string[];
  readonly resource_name: string;
  readonly scopes_supported?: readonly string[];
}

export class OAuthConfigError extends ContextVaultError {
  constructor(message: string) {
    super('CONFIG_INVALID', message);
  }
}

function isLoopback(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/**
 * Vérifie une URL d'émetteur ou de serveur : HTTPS obligatoire, sauf
 * `http://localhost` en développement. Ni identifiants, ni requête, ni fragment.
 */
function parseUrl(name: string, value: string, environment: Environment): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthConfigError(`${name} n'est pas une URL valide : ${value}`);
  }
  const httpAllowed = environment === 'development' && isLoopback(url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && httpAllowed)) {
    throw new OAuthConfigError(
      `${name} doit être en https (http n'est accepté que pour localhost en développement) : ${value}`,
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new OAuthConfigError(
      `${name} ne doit contenir ni identifiants, ni paramètres, ni fragment`,
    );
  }
  return url;
}

function withoutTrailingSlash(url: URL): string {
  return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
}

/**
 * Lit la configuration OAuth dans l'environnement. Renvoie `undefined` si
 * aucun émetteur n'est configuré (développement sans SSO).
 */
export function readOAuthOptions(
  environment: Environment,
  env: NodeJS.ProcessEnv = process.env,
): OAuthOptions | undefined {
  const issuer = env['CONTEXTVAULT_OIDC_ISSUER'];
  const publicUrl = env['CONTEXTVAULT_PUBLIC_URL'];
  if (!issuer && !publicUrl) return undefined;
  if (!issuer) throw new OAuthConfigError('CONTEXTVAULT_OIDC_ISSUER manquant');
  if (!publicUrl) throw new OAuthConfigError('CONTEXTVAULT_PUBLIC_URL manquant');

  parseUrl('CONTEXTVAULT_OIDC_ISSUER', issuer, environment);
  const publicUrlParsed = parseUrl('CONTEXTVAULT_PUBLIC_URL', publicUrl, environment);
  return {
    // Conservé tel quel : il sera comparé caractère par caractère au `iss` des jetons.
    issuer,
    publicUrl: withoutTrailingSlash(publicUrlParsed),
    scopes: (env['CONTEXTVAULT_OIDC_SCOPES'] ?? '').split(/[\s,]+/).filter((s) => s !== ''),
  };
}

/** Identifiant de la ressource : l'URL du point d'entrée MCP (audience attendue). */
export function resourceUrl(options: OAuthOptions): string {
  return `${options.publicUrl}${MCP_PATH}`;
}

export function protectedResourceMetadata(options: OAuthOptions): ProtectedResourceMetadata {
  return {
    resource: resourceUrl(options),
    authorization_servers: [options.issuer],
    bearer_methods_supported: ['header'],
    resource_name: 'ContextVault',
    ...(options.scopes.length > 0 ? { scopes_supported: options.scopes } : {}),
  };
}

/**
 * Chemins où un client cherche les métadonnées : avec le chemin de la
 * ressource en suffixe (RFC 9728 §3.1), puis à la racine (repli des clients).
 */
export function protectedResourceMetadataPaths(): readonly string[] {
  return [`${PROTECTED_RESOURCE_WELL_KNOWN}${MCP_PATH}`, PROTECTED_RESOURCE_WELL_KNOWN];
}
