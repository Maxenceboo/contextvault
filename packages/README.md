# Paquets

Chaque paquet du monorepo vit dans son propre dossier (`packages/<nom>`), publié sous le nom `@contextvault/<nom>`.
Un nouveau paquet doit être ajouté aux `references` du `tsconfig.json` racine.

| Paquet    | Rôle                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `core`    | Modèle de vault, lecture de `vaults.config.json`, stockage des index, logs JSON. Ne dépend d'aucun autre paquet. |
| `server`  | Serveur MCP, binaire `contextvault-server`. Ouvre le stockage des index en lecture seule (ET-02).                |
| `indexer` | Indexeur, binaire `contextvault-indexer`. Seul à écrire les index, en instance unique (verrou `.indexer.lock`).  |

## Variables d'environnement

| Variable                 | Rôle                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `CONTEXTVAULT_CONFIG`    | Chemin de `vaults.config.json` (obligatoire).               |
| `CONTEXTVAULT_INDEX_DIR` | Dossier des index, un sous-dossier par vault (obligatoire). |
| `CONTEXTVAULT_LOG_LEVEL` | `debug`, `info` (défaut), `warn` ou `error`.                |

L'indexeur sort avec le code 2 si un autre indexeur tient déjà le verrou.
