import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseConfig } from './index.js';

const minimalVault = {
  id: 'client-7f3a',
  display_name: 'Client exemple',
  source: 'git@forge.interne:vaults/client-7f3a.git',
  access_roles: ['vault-client-7f3a'],
  status: 'actif',
};

describe('parseConfig', () => {
  it("lit l'exemple du cahier des charges (§9)", () => {
    const config = parseConfig({
      version: '2.0.0',
      settings: {
        enable_rag: false,
        rag: { endpoint: 'https://embeddings.interne.example/v1', model: 'bge-m3' },
        allowed_clients: {
          interne: ['*'],
          eleve: ['claude-enterprise'],
          critique: ['llm-interne'],
        },
        plugins: ['@entreprise/contextvault-habilitation-rh'],
      },
      vaults: [
        {
          id: '_global-socle',
          display_name: 'Socle ESN',
          source: 'git@forge.interne:vaults/global-socle.git',
          inherits: null,
          access_roles: ['all'],
          level: 'interne',
          status: 'actif',
        },
        { ...minimalVault, inherits: ['_global-socle'], level: 'eleve', review_date: '2027-06-30' },
      ],
    });

    expect(config.settings.allowedClients.critique).toEqual(['llm-interne']);
    expect(config.settings.plugins).toEqual(['@entreprise/contextvault-habilitation-rh']);
    expect(config.vaults.map((v) => v.id)).toEqual(['_global-socle', 'client-7f3a']);
    expect(config.vaults[0]?.inherits).toEqual([]);
    expect(config.vaults[1]).toMatchObject({
      displayName: 'Client exemple',
      inherits: ['_global-socle'],
      accessRoles: ['vault-client-7f3a'],
      reviewDate: '2027-06-30',
    });
  });

  it('traite un vault sans niveau comme Élevé (§4.6)', () => {
    const config = parseConfig({ version: '1', vaults: [minimalVault] });
    expect(config.vaults[0]?.level).toBe('eleve');
  });

  it("n'autorise aucun client IA pour un niveau non configuré", () => {
    const config = parseConfig({ version: '1', vaults: [] });
    expect(config.settings.allowedClients).toEqual({ interne: [], eleve: [], critique: [] });
    expect(config.settings.enableRag).toBe(false);
  });

  it.each([
    ['un identifiant en double', { vaults: [minimalVault, minimalVault] }, /en double/],
    ['un identifiant avec chemin', { vaults: [{ ...minimalVault, id: '../etc' }] }, /invalide/],
    ['un identifiant en majuscules', { vaults: [{ ...minimalVault, id: 'Client' }] }, /invalide/],
    ['un niveau inconnu', { vaults: [{ ...minimalVault, level: 'secret' }] }, /level/],
    ['un statut inconnu', { vaults: [{ ...minimalVault, status: 'ferme' }] }, /status/],
    [
      'des rôles absents',
      { vaults: [{ ...minimalVault, access_roles: undefined }] },
      /access_roles/,
    ],
    [
      'une date de revue mal formée',
      { vaults: [{ ...minimalVault, review_date: '30/06/2027' }] },
      /review_date/,
    ],
    [
      'un niveau inconnu dans allowed_clients',
      { settings: { allowed_clients: { top: [] } }, vaults: [] },
      /allowed_clients/,
    ],
  ])('refuse %s', (_label, partial, message) => {
    expect(() => parseConfig({ version: '1', ...partial })).toThrow(message);
    expect(() => parseConfig({ version: '1', ...partial })).toThrow(ConfigError);
  });
});

describe('loadConfig', () => {
  it('signale un fichier absent ou un JSON invalide', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-config-'));
    await expect(loadConfig(join(dir, 'absent.json'))).rejects.toThrow(/illisible/);
    await writeFile(join(dir, 'bad.json'), '{ pas du json');
    await expect(loadConfig(join(dir, 'bad.json'))).rejects.toThrow(/JSON invalide/);
  });
});
