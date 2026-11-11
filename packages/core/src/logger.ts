/**
 * Logs techniques en JSON, une ligne par événement (T19).
 *
 * Ces logs ne doivent jamais contenir de question ni d'extrait de document :
 * seuls des identifiants et des métadonnées techniques y figurent.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly write?: (line: string) => void;
  readonly now?: () => Date;
}

export function createLogger(component: string, options: LoggerOptions = {}): Logger {
  const minimum = LEVEL_ORDER[options.level ?? 'info'];
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const now = options.now ?? (() => new Date());

  const log = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[level] < minimum) return;
    write(
      `${JSON.stringify({ time: now().toISOString(), level, component, message, ...fields })}\n`,
    );
  };

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
  };
}

export function parseLogLevel(value: string | undefined): LogLevel {
  return value !== undefined && value in LEVEL_ORDER ? (value as LogLevel) : 'info';
}
