import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function manifest(name: string): Promise<{ dependencies?: Record<string, string> }> {
  const url = new URL(`../../${name}/package.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8')) as { dependencies?: Record<string, string> };
}

describe('sens des dépendances (BC-02.1)', () => {
  it('core ne dépend ni du serveur ni de l’indexeur', async () => {
    const deps = Object.keys((await manifest('core')).dependencies ?? {});
    expect(deps.filter((d) => d.startsWith('@contextvault/'))).toEqual([]);
  });

  it.each(['server', 'indexer'])('%s dépend de core et pas de l’autre binaire', async (name) => {
    const deps = Object.keys((await manifest(name)).dependencies ?? {});
    expect(deps).toContain('@contextvault/core');
    expect(deps).not.toContain(
      name === 'server' ? '@contextvault/indexer' : '@contextvault/server',
    );
  });
});
