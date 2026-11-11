/**
 * Lecture de `vaults.config.json` (cahier des charges §9).
 *
 * Ce module vérifie la forme du fichier et applique les valeurs par défaut.
 * Les règles de cohérence entre vaults (parents existants, cycles, niveaux
 * hérités, endpoint interne) relèvent de BC-20.
 */

import { readFile } from 'node:fs/promises';
import { ConfigError } from './errors.js';
import {
  DEFAULT_VAULT_LEVEL,
  VAULT_LEVELS,
  VAULT_STATUSES,
  isValidVaultId,
  type Vault,
  type VaultLevel,
  type VaultStatus,
} from './vault.js';

export interface RagSettings {
  readonly endpoint: string;
  readonly model: string;
}

export interface Settings {
  readonly enableRag: boolean;
  readonly rag?: RagSettings;
  /** Clients IA autorisés par niveau (EF-19). `*` = tous. */
  readonly allowedClients: Readonly<Record<VaultLevel, readonly string[]>>;
  /** Plugins, dans l'ordre d'application (T17). */
  readonly plugins: readonly string[];
}

export interface ContextVaultConfig {
  readonly version: string;
  readonly settings: Settings;
  readonly vaults: readonly Vault[];
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(obj: Json, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${where}.${key} doit être une chaîne non vide`);
  }
  return value;
}

function stringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v === '')) {
    throw new ConfigError(`${where} doit être une liste de chaînes non vides`);
  }
  return value as string[];
}

function optionalBoolean(value: unknown, where: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ConfigError(`${where} doit être un booléen`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ConfigError(`${where} doit valoir ${allowed.map((a) => `"${a}"`).join(', ')}`);
  }
  return value as T;
}

function parseSettings(raw: unknown): Settings {
  if (raw === undefined) {
    return {
      enableRag: false,
      allowedClients: { interne: [], eleve: [], critique: [] },
      plugins: [],
    };
  }
  if (!isObject(raw)) throw new ConfigError('settings doit être un objet');

  let rag: RagSettings | undefined;
  if (raw['rag'] !== undefined) {
    if (!isObject(raw['rag'])) throw new ConfigError('settings.rag doit être un objet');
    rag = {
      endpoint: stringField(raw['rag'], 'endpoint', 'settings.rag'),
      model: stringField(raw['rag'], 'model', 'settings.rag'),
    };
  }

  const clientsRaw = raw['allowed_clients'] ?? {};
  if (!isObject(clientsRaw)) throw new ConfigError('settings.allowed_clients doit être un objet');
  for (const key of Object.keys(clientsRaw)) {
    oneOf(key, VAULT_LEVELS, `settings.allowed_clients (clé "${key}")`);
  }
  const allowedClients = Object.fromEntries(
    VAULT_LEVELS.map((level) => [
      level,
      // Niveau absent : aucun client autorisé (refus par défaut).
      clientsRaw[level] === undefined
        ? []
        : stringArray(clientsRaw[level], `settings.allowed_clients.${level}`),
    ]),
  ) as Record<VaultLevel, string[]>;

  return {
    enableRag: optionalBoolean(raw['enable_rag'], 'settings.enable_rag') ?? false,
    ...(rag ? { rag } : {}),
    allowedClients,
    plugins: raw['plugins'] === undefined ? [] : stringArray(raw['plugins'], 'settings.plugins'),
  };
}

function parseVault(raw: unknown, index: number): Vault {
  const where = `vaults[${index}]`;
  if (!isObject(raw)) throw new ConfigError(`${where} doit être un objet`);

  const id = stringField(raw, 'id', where);
  if (!isValidVaultId(id)) {
    throw new ConfigError(
      `${where}.id "${id}" invalide : minuscules, chiffres et tirets uniquement (un "_" initial est permis)`,
    );
  }
  const at = `vaults["${id}"]`;

  const inherits =
    raw['inherits'] === undefined || raw['inherits'] === null
      ? []
      : stringArray(raw['inherits'], `${at}.inherits`);

  const reviewDate = raw['review_date'];
  if (
    reviewDate !== undefined &&
    (typeof reviewDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate))
  ) {
    throw new ConfigError(`${at}.review_date doit être une date AAAA-MM-JJ`);
  }
  const enableRag = optionalBoolean(raw['enable_rag'], `${at}.enable_rag`);

  return {
    id,
    displayName: stringField(raw, 'display_name', at),
    source: stringField(raw, 'source', at),
    inherits,
    accessRoles: stringArray(raw['access_roles'], `${at}.access_roles`),
    level:
      raw['level'] === undefined
        ? DEFAULT_VAULT_LEVEL
        : oneOf<VaultLevel>(raw['level'], VAULT_LEVELS, `${at}.level`),
    status: oneOf<VaultStatus>(raw['status'], VAULT_STATUSES, `${at}.status`),
    ...(reviewDate !== undefined ? { reviewDate } : {}),
    ...(enableRag !== undefined ? { enableRag } : {}),
  };
}

/** Transforme le contenu JSON déjà décodé en configuration typée. */
export function parseConfig(raw: unknown): ContextVaultConfig {
  if (!isObject(raw)) throw new ConfigError('La configuration doit être un objet JSON');
  const version = stringField(raw, 'version', 'configuration');
  if (!Array.isArray(raw['vaults'])) throw new ConfigError('vaults doit être une liste');

  const vaults = raw['vaults'].map(parseVault);
  const seen = new Set<string>();
  for (const vault of vaults) {
    if (seen.has(vault.id)) throw new ConfigError(`Identifiant de vault en double : "${vault.id}"`);
    seen.add(vault.id);
  }

  return { version, settings: parseSettings(raw['settings']), vaults };
}

/** Lit et décode `vaults.config.json`. */
export async function loadConfig(path: string): Promise<ContextVaultConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new ConfigError(`Configuration illisible : ${path}`, { cause });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new ConfigError(`Configuration JSON invalide : ${path}`, { cause });
  }
  return parseConfig(raw);
}
