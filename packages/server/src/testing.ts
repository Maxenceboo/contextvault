// Aides de test partagées (non exportées par le paquet).
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function writeTestConfig(): Promise<{ configPath: string; indexDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-server-'));
  const configPath = join(dir, 'vaults.config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      version: '1',
      vaults: [
        {
          id: 'client-7f3a',
          display_name: 'Client',
          source: 'git@forge:client.git',
          access_roles: ['vault-client-7f3a'],
          status: 'actif',
        },
      ],
    }),
  );
  return { configPath, indexDir: join(dir, 'index') };
}
