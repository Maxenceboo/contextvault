import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyLicense,
  findViolations,
  listInstalledDependencies,
  readLicense,
} from '../check-licenses.mjs';

const SCRIPT = fileURLToPath(new URL('../check-licenses.mjs', import.meta.url));

describe('classifyLicense', () => {
  it.each(['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'MPL-2.0', '0BSD', 'BlueOak-1.0.0'])(
    'autorise %s',
    (license) => expect(classifyLicense(license)).toBe('allowed'),
  );

  it.each([
    'GPL-2.0',
    'GPL-3.0-only',
    'GPL-3.0-or-later',
    'AGPL-3.0',
    'agpl-3.0-only',
    'LGPL-2.1',
    'GPL',
    'GPL-2.0 WITH Classpath-exception-2.0',
  ])('interdit %s', (license) => expect(classifyLicense(license)).toBe('forbidden'));

  it('accepte une licence à choix si une branche est autorisée', () => {
    expect(classifyLicense('(MIT OR GPL-3.0)')).toBe('allowed');
    expect(classifyLicense('GPL-2.0 OR AGPL-3.0')).toBe('forbidden');
  });

  it('refuse une combinaison AND contenant une licence interdite', () => {
    expect(classifyLicense('MIT AND GPL-3.0')).toBe('forbidden');
    expect(classifyLicense('(MIT AND Apache-2.0) OR GPL-3.0')).toBe('allowed');
  });

  it.each([undefined, '', 'UNLICENSED', 'SEE LICENSE IN LICENSE.txt', 'MIT OR'])(
    'considère %j comme inconnue',
    (license) => expect(classifyLicense(license)).toBe('unknown'),
  );
});

describe('readLicense', () => {
  it('lit les anciens formats de package.json', () => {
    expect(readLicense({ license: 'MIT' })).toBe('MIT');
    expect(readLicense({ license: { type: 'GPL-2.0' } })).toBe('GPL-2.0');
    expect(readLicense({ licenses: [{ type: 'MIT' }, { type: 'GPL-2.0' }] })).toBe(
      '(MIT OR GPL-2.0)',
    );
    expect(readLicense({})).toBeUndefined();
  });
});

describe('findViolations', () => {
  /** @param {string} name @param {string | undefined} license */
  const dep = (name, license) => ({
    name,
    version: '1.0.0',
    license,
    location: `node_modules/${name}`,
  });

  it('signale les licences interdites et inconnues', () => {
    const violations = findViolations([
      dep('ok', 'MIT'),
      dep('bad', 'GPL-3.0'),
      dep('mystery', undefined),
    ]);
    expect(violations.map((v) => [v.dependency.name, v.reason])).toEqual([
      ['bad', 'forbidden'],
      ['mystery', 'unknown'],
    ]);
  });

  it('respecte les exceptions déclarées, y compris par version', () => {
    const deps = [dep('bad', 'GPL-3.0'), dep('other', 'AGPL-3.0')];
    const violations = findViolations(deps, [
      { name: 'bad', reason: 'Validé RSSI' },
      { name: 'other', version: '2.0.0', reason: 'Autre version seulement' },
    ]);
    expect(violations.map((v) => v.dependency.name)).toEqual(['other']);
  });
});

describe('ligne de commande', () => {
  /** @type {string[]} */
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Crée un projet factice avec une dépendance installée sous la licence donnée.
   * @param {string} license
   */
  function fakeProject(license) {
    const dir = mkdtempSync(join(tmpdir(), 'cv-licenses-'));
    dirs.push(dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fake', version: '1.0.0', dependencies: { dep: '1.0.0' } }),
    );
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'dep', 'package.json'),
      JSON.stringify({ name: 'dep', version: '1.0.0', license }),
    );
    return dir;
  }

  it('échoue quand une dépendance GPL est installée', () => {
    const dir = fakeProject('GPL-3.0');
    const run = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('dep@1.0.0 (GPL-3.0) : licence interdite');
  });

  it('réussit quand toutes les dépendances sont autorisées', () => {
    const dir = fakeProject('MIT');
    expect(() => execFileSync('node', [SCRIPT], { cwd: dir, stdio: 'pipe' })).not.toThrow();
  });

  it('réussit avec une exception déclarée', () => {
    const dir = fakeProject('AGPL-3.0');
    writeFileSync(
      join(dir, '.license-exceptions.json'),
      JSON.stringify([{ name: 'dep', reason: 'Test' }]),
    );
    expect(() => execFileSync('node', [SCRIPT], { cwd: dir, stdio: 'pipe' })).not.toThrow();
  });

  it('ignore les paquets du dépôt lui-même', () => {
    const dir = fakeProject('MIT');
    const names = listInstalledDependencies(dir).map((d) => d.name);
    expect(names).toEqual(['dep']);
  });
});
