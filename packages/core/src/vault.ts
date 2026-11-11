/**
 * Modèle de vault (cahier des charges §4.1, §4.6, §4.11, §9).
 */

/** Niveaux de confidentialité, du moins au plus sensible (§4.6). */
export const VAULT_LEVELS = ['interne', 'eleve', 'critique'] as const;
export type VaultLevel = (typeof VAULT_LEVELS)[number];

/** Un vault sans niveau déclaré est traité comme Élevé (§4.6). */
export const DEFAULT_VAULT_LEVEL: VaultLevel = 'eleve';

/** États du cycle de vie (§4.11). */
export const VAULT_STATUSES = ['prospect', 'actif', 'maintenance', 'archive', 'supprime'] as const;
export type VaultStatus = (typeof VAULT_STATUSES)[number];

/** États dans lesquels l'IA peut lire le vault (§4.11, EF-37). */
const READABLE_STATUSES: ReadonlySet<VaultStatus> = new Set(['prospect', 'actif', 'maintenance']);

/**
 * Identifiant de vault : minuscules, chiffres, tirets, avec un `_` initial
 * autorisé pour les vaults transverses (`_global-socle`). Il sert aussi de nom
 * de fichier d'index : aucun séparateur de chemin ni `..` ne peut y figurer.
 */
export const VAULT_ID_PATTERN = /^_?[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidVaultId(id: string): boolean {
  return VAULT_ID_PATTERN.test(id);
}

export interface Vault {
  readonly id: string;
  readonly displayName: string;
  /** Dépôt git du contenu (lecture seule pour l'indexeur). */
  readonly source: string;
  /** Parents dans l'ordre déclaré (EF-01). Vide si aucun. */
  readonly inherits: readonly string[];
  /** Groupes de l'annuaire donnant accès, ou `all`. */
  readonly accessRoles: readonly string[];
  readonly level: VaultLevel;
  readonly status: VaultStatus;
  /** Date de revue au format AAAA-MM-JJ (EF-35). */
  readonly reviewDate?: string;
  /** Surcharge par vault du réglage global `enable_rag`. */
  readonly enableRag?: boolean;
}

export function levelRank(level: VaultLevel): number {
  return VAULT_LEVELS.indexOf(level);
}

/** Un vault archivé ou supprimé n'est jamais servi, quelle que soit l'extension (EF-37). */
export function isReadableStatus(status: VaultStatus): boolean {
  return READABLE_STATUSES.has(status);
}
