/**
 * Paramètres communs au serveur et à l'indexeur, lus dans l'environnement.
 */

import { ConfigError } from './errors.js';
import { parseLogLevel, type LogLevel } from './logger.js';

/**
 * `development` débloque les facilités de développement (stdio, HTTP sans
 * authentification). Toute autre valeur, ou l'absence de valeur, vaut
 * `production` : le mode sûr est le mode par défaut.
 */
export type Environment = 'development' | 'production';

export interface RuntimeOptions {
  /** Chemin de `vaults.config.json`. */
  readonly configPath: string;
  /** Dossier des index (mode Docker Compose mono-machine, T9). */
  readonly indexDir: string;
  readonly logLevel: LogLevel;
  readonly environment: Environment;
}

export function parseEnvironment(value: string | undefined): Environment {
  return value === 'development' ? 'development' : 'production';
}

export function readRuntimeOptions(env: NodeJS.ProcessEnv = process.env): RuntimeOptions {
  const configPath = env['CONTEXTVAULT_CONFIG'];
  const indexDir = env['CONTEXTVAULT_INDEX_DIR'];
  if (!configPath) throw new ConfigError('Variable CONTEXTVAULT_CONFIG manquante');
  if (!indexDir) throw new ConfigError('Variable CONTEXTVAULT_INDEX_DIR manquante');
  return {
    configPath,
    indexDir,
    logLevel: parseLogLevel(env['CONTEXTVAULT_LOG_LEVEL']),
    environment: parseEnvironment(env['CONTEXTVAULT_ENV']),
  };
}
