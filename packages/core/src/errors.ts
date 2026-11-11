/** Erreur de base : toutes les erreurs du cœur portent un code stable. */
export class ContextVaultError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigError extends ContextVaultError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONFIG_INVALID', message, options);
  }
}

/** Levée par toute tentative d'écriture sur un stockage ouvert en lecture (ET-02). */
export class StorageReadOnlyError extends ContextVaultError {
  constructor(operation: string) {
    super(
      'STORAGE_READ_ONLY',
      `Écriture refusée (${operation}) : ce processus n'a accès aux index qu'en lecture.`,
    );
  }
}

export class StorageNotFoundError extends ContextVaultError {
  constructor(vaultId: string, file: string) {
    super('STORAGE_NOT_FOUND', `Fichier d'index introuvable : ${vaultId}/${file}`);
  }
}
