// Contrôle de licences bloquant (BC-01.3, décision T4).
//
// Lit toutes les dépendances installées via `npm query "*"` et échoue si l'une
// d'elles est sous licence GPL, LGPL ou AGPL, ou si sa licence est inconnue.
// Une licence à choix (« MIT OR GPL-3.0 ») est acceptée si au moins une branche
// est autorisée. Les exceptions validées sont listées dans `.license-exceptions.json`.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Familles copyleft interdites dans le code (T4). */
const FORBIDDEN = /^(A|L)?GPL(-|$)/i;

/**
 * @typedef {{ name: string, version: string, license: string | undefined, location: string }} Dependency
 * @typedef {{ dependency: Dependency, reason: 'forbidden' | 'unknown' }} Violation
 * @typedef {{ name: string, version?: string, reason: string }} LicenseException
 */

/**
 * Extrait la licence d'un package.json, y compris les anciens formats
 * (`license: { type }` ou `licenses: [{ type }]`).
 * @param {Record<string, unknown>} pkg
 * @returns {string | undefined}
 */
export function readLicense(pkg) {
  const { license, licenses } = pkg;
  if (typeof license === 'string' && license.trim() !== '') return license.trim();
  if (license && typeof license === 'object' && 'type' in license) {
    return String(license.type);
  }
  if (Array.isArray(licenses) && licenses.length > 0) {
    const types = licenses
      .map((l) => (l && typeof l === 'object' && 'type' in l ? String(l.type) : ''))
      .filter(Boolean);
    if (types.length > 0) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return undefined;
}

/**
 * Évalue une expression SPDX simplifiée (identifiants, AND, OR, parenthèses, WITH).
 * Renvoie `forbidden`, `unknown` ou `allowed`.
 * @param {string | undefined} expression
 * @returns {'allowed' | 'forbidden' | 'unknown'}
 */
export function classifyLicense(expression) {
  if (!expression) return 'unknown';
  const trimmed = expression.trim();
  if (trimmed === '' || /^(UNLICENSED|UNKNOWN|SEE LICENSE IN\b)/i.test(trimmed)) return 'unknown';

  const tokens = trimmed.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
  let pos = 0;

  /** @returns {'allowed' | 'forbidden' | 'unknown'} */
  function parseOr() {
    let result = parseAnd();
    while (tokens[pos]?.toUpperCase() === 'OR') {
      pos++;
      const right = parseAnd();
      // Il suffit d'une branche autorisée pour pouvoir choisir cette licence.
      if (result === 'allowed' || right === 'allowed') result = 'allowed';
      else if (result === 'unknown' || right === 'unknown') result = 'unknown';
      else result = 'forbidden';
    }
    return result;
  }

  /** @returns {'allowed' | 'forbidden' | 'unknown'} */
  function parseAnd() {
    let result = parseAtom();
    while (tokens[pos]?.toUpperCase() === 'AND') {
      pos++;
      const right = parseAtom();
      // Toutes les licences s'appliquent : la plus restrictive l'emporte.
      if (result === 'forbidden' || right === 'forbidden') result = 'forbidden';
      else if (result === 'unknown' || right === 'unknown') result = 'unknown';
      else result = 'allowed';
    }
    return result;
  }

  /** @returns {'allowed' | 'forbidden' | 'unknown'} */
  function parseAtom() {
    const token = tokens[pos++];
    if (token === undefined) return 'unknown';
    if (token === '(') {
      const inner = parseOr();
      if (tokens[pos] === ')') pos++;
      return inner;
    }
    // « GPL-2.0 WITH Classpath-exception-2.0 » reste du GPL : on ignore l'exception.
    if (tokens[pos]?.toUpperCase() === 'WITH') pos += 2;
    return FORBIDDEN.test(token) ? 'forbidden' : 'allowed';
  }

  const result = parseOr();
  return pos === tokens.length ? result : 'unknown';
}

/**
 * @param {Dependency[]} dependencies
 * @param {LicenseException[]} exceptions
 * @returns {Violation[]}
 */
export function findViolations(dependencies, exceptions = []) {
  /** @type {Violation[]} */
  const violations = [];
  for (const dependency of dependencies) {
    const status = classifyLicense(dependency.license);
    if (status === 'allowed') continue;
    const excepted = exceptions.some(
      (e) =>
        e.name === dependency.name && (e.version === undefined || e.version === dependency.version),
    );
    if (!excepted) violations.push({ dependency, reason: status });
  }
  return violations;
}

/**
 * Liste les dépendances installées (hors paquets du dépôt lui-même).
 * @param {string} cwd
 * @returns {Dependency[]}
 */
export function listInstalledDependencies(cwd) {
  const output = execFileSync('npm', ['query', '*'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  /** @type {Array<Record<string, unknown>>} */
  const nodes = JSON.parse(output);
  /** @type {Map<string, Dependency>} */
  const unique = new Map();
  for (const node of nodes) {
    const location = String(node.location ?? '');
    // Racine et paquets du monorepo : couverts par la licence Apache-2.0 du dépôt.
    if (!location.includes('node_modules')) continue;
    const dependency = {
      name: String(node.name),
      version: String(node.version),
      license: readLicense(node),
      location,
    };
    unique.set(`${dependency.name}@${dependency.version}`, dependency);
  }
  return [...unique.values()];
}

/**
 * @param {string} path
 * @returns {LicenseException[]}
 */
export function loadExceptions(path) {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${path} doit contenir un tableau`);
  for (const entry of parsed) {
    if (typeof entry?.name !== 'string' || typeof entry?.reason !== 'string') {
      throw new Error(`${path} : chaque exception doit avoir "name" et "reason"`);
    }
  }
  return parsed;
}

function main() {
  const cwd = process.cwd();
  const dependencies = listInstalledDependencies(cwd);
  const exceptions = loadExceptions(`${cwd}/.license-exceptions.json`);
  const violations = findViolations(dependencies, exceptions);

  if (violations.length === 0) {
    console.log(`Licences : ${dependencies.length} dépendances vérifiées, aucune interdite.`);
    return;
  }
  console.error(`Licences : ${violations.length} dépendance(s) refusée(s) :`);
  for (const { dependency, reason } of violations) {
    const label = reason === 'forbidden' ? 'licence interdite' : 'licence inconnue';
    console.error(
      `  - ${dependency.name}@${dependency.version} (${dependency.license ?? 'aucune'}) : ${label} [${dependency.location}]`,
    );
  }
  console.error(
    'GPL, LGPL et AGPL sont interdites (décision T4). Une exception validée par le RSSI se déclare dans .license-exceptions.json.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
