import { describe, expect, it } from 'vitest';
import { createLogger, parseLogLevel } from './index.js';

describe('createLogger', () => {
  it('écrit une ligne JSON par événement et filtre sous le niveau minimum', () => {
    const lines: string[] = [];
    const logger = createLogger('server', {
      level: 'info',
      write: (line) => lines.push(line),
      now: () => new Date('2026-11-11T10:00:00Z'),
    });
    logger.debug('ignoré');
    logger.info('démarré', { vaults: 2 });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      time: '2026-11-11T10:00:00.000Z',
      level: 'info',
      component: 'server',
      message: 'démarré',
      vaults: 2,
    });
  });

  it('retombe sur info pour un niveau inconnu', () => {
    expect(parseLogLevel('trace')).toBe('info');
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel(undefined)).toBe('info');
  });
});
