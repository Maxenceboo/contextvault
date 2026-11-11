/**
 * Paramètres communs au serveur et à l'indexeur, lus dans l'environnement.
 */

import { ConfigError } from './errors.js';
import { parseLogLevel, type LogLevel } from './logger.js';

export interface RuntimeOptions {
  /** Chemin de `vaults.config.json`. */
  readonly configPath: string;
  /** Dossier des index (mode Docker Compose mono-machine, T9). */
  readonly indexDir: string;
  readonly logLevel: LogLevel;
}

export function readRuntimeOptions(env: NodeJS.ProcessEnv = process.env): RuntimeOptions {
  const configPath = env['CONTEXTVAULT_CONFIG'];
  const indexDir = env['CONTEXTVAULT_INDEX_DIR'];
  if (!configPath) throw new ConfigError('Variable CONTEXTVAULT_CONFIG manquante');
  if (!indexDir) throw new ConfigError('Variable CONTEXTVAULT_INDEX_DIR manquante');
  return { configPath, indexDir, logLevel: parseLogLevel(env['CONTEXTVAULT_LOG_LEVEL']) };
}
