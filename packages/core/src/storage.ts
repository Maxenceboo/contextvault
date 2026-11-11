/**
 * Stockage des index (ET-02, ET-03, T9).
 *
 * Le serveur ouvre le stockage en lecture, l'indexeur en écriture. Le mode est
 * vérifié à l'exécution sur chaque opération d'écriture, en plus du typage :
 * une écriture depuis un stockage en lecture lève `StorageReadOnlyError`.
 *
 * Seul l'adaptateur « dossier local » (Docker Compose mono-machine) existe pour
 * l'instant ; le stockage objet S3 viendra derrière la même interface (BC-32).
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContextVaultError, StorageNotFoundError, StorageReadOnlyError } from './errors.js';
import { isValidVaultId } from './vault.js';

export type StorageMode = 'read' | 'write';

/** Opérations disponibles pour tous les processus. */
export interface ReadableIndexStorage {
  readonly mode: StorageMode;
  /** Vaults ayant au moins un fichier d'index. */
  listVaults(): Promise<string[]>;
  listFiles(vaultId: string): Promise<string[]>;
  readFile(vaultId: string, file: string): Promise<Uint8Array>;
}

/** Opérations réservées à l'indexeur. */
export interface WritableIndexStorage extends ReadableIndexStorage {
  readonly mode: 'write';
  /** Écriture atomique (fichier temporaire puis renommage). */
  writeFile(vaultId: string, file: string, data: Uint8Array | string): Promise<void>;
  removeFile(vaultId: string, file: string): Promise<void>;
  removeVault(vaultId: string): Promise<void>;
}

export interface LocalStorageOptions {
  readonly kind: 'local';
  /** Dossier racine des index : un sous-dossier par vault. */
  readonly path: string;
}

export type StorageOptions = LocalStorageOptions;

const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class InvalidStoragePathError extends ContextVaultError {
  constructor(what: string, value: string) {
    super('STORAGE_INVALID_PATH', `${what} invalide pour le stockage : "${value}"`);
  }
}

function checkVaultId(vaultId: string): void {
  if (!isValidVaultId(vaultId)) throw new InvalidStoragePathError('Identifiant de vault', vaultId);
}

function checkFileName(file: string): void {
  // Pas de séparateur ni de `..` : un nom ne peut pas sortir du dossier de son vault.
  if (!FILE_NAME_PATTERN.test(file) || file.includes('..')) {
    throw new InvalidStoragePathError('Nom de fichier', file);
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

class LocalDirectoryStorage implements ReadableIndexStorage {
  constructor(
    private readonly root: string,
    readonly mode: StorageMode,
  ) {}

  private assertWritable(operation: string): void {
    if (this.mode !== 'write') throw new StorageReadOnlyError(operation);
  }

  private vaultDir(vaultId: string): string {
    checkVaultId(vaultId);
    return join(this.root, vaultId);
  }

  private filePath(vaultId: string, file: string): string {
    checkFileName(file);
    return join(this.vaultDir(vaultId), file);
  }

  async listVaults(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && isValidVaultId(e.name))
        .map((e) => e.name)
        .sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async listFiles(vaultId: string): Promise<string[]> {
    try {
      const entries = await readdir(this.vaultDir(vaultId), { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && FILE_NAME_PATTERN.test(e.name) && !e.name.endsWith('.tmp'))
        .map((e) => e.name)
        .sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async readFile(vaultId: string, file: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.filePath(vaultId, file)));
    } catch (error) {
      if (isMissing(error)) throw new StorageNotFoundError(vaultId, file);
      throw error;
    }
  }

  async writeFile(vaultId: string, file: string, data: Uint8Array | string): Promise<void> {
    this.assertWritable('writeFile');
    const target = this.filePath(vaultId, file);
    await mkdir(this.vaultDir(vaultId), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, data, { flag: 'w' });
    await rename(temp, target);
  }

  async removeFile(vaultId: string, file: string): Promise<void> {
    this.assertWritable('removeFile');
    await rm(this.filePath(vaultId, file), { force: true });
  }

  async removeVault(vaultId: string): Promise<void> {
    this.assertWritable('removeVault');
    await rm(this.vaultDir(vaultId), { recursive: true, force: true });
  }
}

/**
 * Ouvre le stockage des index. Le serveur passe `read`, l'indexeur `write`.
 * En lecture, le dossier peut ne pas encore exister (rien n'est publié) ;
 * en écriture, il est créé.
 */
export async function openIndexStorage(
  options: StorageOptions,
  mode: 'read',
): Promise<ReadableIndexStorage>;
export async function openIndexStorage(
  options: StorageOptions,
  mode: 'write',
): Promise<WritableIndexStorage>;
export async function openIndexStorage(
  options: StorageOptions,
  mode: StorageMode,
): Promise<ReadableIndexStorage | WritableIndexStorage> {
  if (mode === 'write') {
    await mkdir(options.path, { recursive: true });
    return new LocalDirectoryStorage(options.path, mode) as WritableIndexStorage;
  }
  return new LocalDirectoryStorage(options.path, mode);
}
