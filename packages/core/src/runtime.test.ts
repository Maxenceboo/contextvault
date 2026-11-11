import { describe, expect, it } from 'vitest';
import { ConfigError, readRuntimeOptions } from './index.js';

const base = { CONTEXTVAULT_CONFIG: '/etc/cv/vaults.config.json', CONTEXTVAULT_INDEX_DIR: '/data' };

describe('readRuntimeOptions', () => {
  it('lit les variables et applique les défauts', () => {
    expect(readRuntimeOptions(base)).toEqual({
      configPath: '/etc/cv/vaults.config.json',
      indexDir: '/data',
      logLevel: 'info',
      environment: 'production',
    });
  });

  it('ne passe en développement que sur la valeur exacte « development »', () => {
    expect(readRuntimeOptions({ ...base, CONTEXTVAULT_ENV: 'development' }).environment).toBe(
      'development',
    );
    for (const value of ['dev', 'DEVELOPMENT', 'test', '']) {
      expect(readRuntimeOptions({ ...base, CONTEXTVAULT_ENV: value }).environment).toBe(
        'production',
      );
    }
  });

  it('exige la configuration et le dossier des index', () => {
    expect(() => readRuntimeOptions({ CONTEXTVAULT_INDEX_DIR: '/data' })).toThrow(ConfigError);
    expect(() => readRuntimeOptions({ CONTEXTVAULT_CONFIG: '/c.json' })).toThrow(ConfigError);
  });
});
