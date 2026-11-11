# Paquets

Chaque paquet du monorepo vit dans son propre dossier (`packages/<nom>`), publié sous le nom `@contextvault/<nom>`.
Un nouveau paquet doit être ajouté aux `references` du `tsconfig.json` racine.

| Paquet    | Rôle                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core`    | Modèle de vault, lecture de `vaults.config.json`, stockage des index, logs JSON. Ne dépend d'aucun autre paquet.                                                                                                                                       |
| `server`  | Serveur MCP, binaire `contextvault-server [--stdio]`. Transport HTTP sans session sur `/mcp`, sondes `/healthz` et `/readyz`, métadonnées OAuth sur `/.well-known/oauth-protected-resource/mcp`. Ouvre le stockage des index en lecture seule (ET-02). |
| `indexer` | Indexeur, binaire `contextvault-indexer`. Seul à écrire les index, en instance unique (verrou `.indexer.lock`, rafraîchi toutes les 10 s et repris s'il est abandonné depuis plus de 60 s).                                                            |

## Variables d'environnement

| Variable                                 | Rôle                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXTVAULT_CONFIG`                    | Chemin de `vaults.config.json` (obligatoire).                                                                                   |
| `CONTEXTVAULT_INDEX_DIR`                 | Dossier des index, un sous-dossier par vault (obligatoire).                                                                     |
| `CONTEXTVAULT_ENV`                       | `development` débloque le transport HTTP sans authentification et le mode stdio. Toute autre valeur vaut `production` (défaut). |
| `CONTEXTVAULT_HOST`, `CONTEXTVAULT_PORT` | Écoute HTTP du serveur (défaut `127.0.0.1:8080`, `0.0.0.0:8080` dans l'image).                                                  |
| `CONTEXTVAULT_OIDC_ISSUER`               | Émetteur OIDC de l'entreprise, annoncé aux clients MCP (RFC 9728). HTTPS obligatoire, sauf `localhost` en développement.        |
| `CONTEXTVAULT_PUBLIC_URL`                | URL publique du serveur vue par les clients, sans `/mcp`. Obligatoire avec l'émetteur.                                          |
| `CONTEXTVAULT_OIDC_SCOPES`               | Portées annoncées aux clients, séparées par des virgules (facultatif).                                                          |
| `CONTEXTVAULT_LOG_LEVEL`                 | `debug`, `info` (défaut), `warn` ou `error`.                                                                                    |

L'indexeur sort avec le code 2 si un autre indexeur tient déjà le verrou.
