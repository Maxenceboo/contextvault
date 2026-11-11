import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writeTestConfig } from './testing.js';

// Binaire compilé : `npm test` lance `tsc -b` avant Vitest.
const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

async function env(environment?: string): Promise<NodeJS.ProcessEnv> {
  const { configPath, indexDir } = await writeTestConfig();
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    CONTEXTVAULT_CONFIG: configPath,
    CONTEXTVAULT_INDEX_DIR: indexDir,
  };
  delete base['CONTEXTVAULT_ENV'];
  if (environment !== undefined) base['CONTEXTVAULT_ENV'] = environment;
  return base;
}

describe('mode stdio (BC-03.3)', () => {
  it.each([undefined, 'production', 'staging'])(
    'est refusé quand CONTEXTVAULT_ENV vaut %s',
    async (environment) => {
      const run = spawnSync(process.execPath, [BIN, '--stdio'], {
        env: await env(environment),
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('Transport stdio refusé');
      expect(run.stdout).toBe('');
    },
  );

  it('répond en développement, avec les logs hors de la sortie standard', async () => {
    const child = spawn(process.execPath, [BIN, '--stdio'], {
      env: await env('development'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

    const response = new Promise<string>((resolve) => {
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('\n')) resolve(stdout);
      });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      })}\n`,
    );

    const line = (await response).trim();
    child.kill('SIGTERM');
    // La sortie standard ne porte que le protocole : une seule réponse JSON-RPC.
    expect(JSON.parse(line)).toMatchObject({
      id: 1,
      result: { serverInfo: { name: 'contextvault' } },
    });
    expect(stderr).toContain('Serveur démarré');
  });
});

describe('mode HTTP', () => {
  it('est refusé hors développement tant que BC-10 n’est pas livré', async () => {
    const run = spawnSync(process.execPath, [BIN], {
      env: { ...(await env('production')), CONTEXTVAULT_PORT: '0' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('Transport HTTP refusé');
  });
});
