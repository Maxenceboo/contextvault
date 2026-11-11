# ContextVault

Serveur MCP de banque de contextes multi-vaults pour les ESN et grands groupes : chaque projet client a son propre vault, hérite du socle commun, avec droits issus de l'annuaire, lecture seule pour l'IA et audit complet.

La documentation de cadrage est dans [`docs/`](docs/README.md).

## Développement

Prérequis : Node.js 22 (voir `.nvmrc`).

```sh
npm install
npm run build          # compilation TypeScript (tsc -b) et vérification de types
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format pour corriger)
npm test               # Vitest
npm run licenses       # contrôle de licences : GPL, LGPL et AGPL interdites
```

La CI (`.github/workflows/ci.yml`) lance ces cinq étapes sur chaque demande de fusion, puis construit et vérifie l'image Docker.

### Environnement de développement

```sh
docker compose up --build
```

- Serveur MCP : `http://localhost:8080/mcp` (sondes `/healthz` et `/readyz`), avec deux vaults fictifs (`dev/vaults`). Il annonce Keycloak comme émetteur SSO sur `/.well-known/oauth-protected-resource/mcp`.
- Keycloak : `http://localhost:8081` (admin / admin ; utilisateurs `alice` / `alice`, membre de `vault-client-demo`, et `bob` / `bob`).
- Mode stdio pour un client MCP local : `CONTEXTVAULT_ENV=development node packages/server/dist/bin.js --stdio`.

Le transport HTTP sans authentification et le mode stdio sont refusés hors `CONTEXTVAULT_ENV=development`. Installation sur un réseau isolé : [docs/installation-hors-ligne.md](docs/installation-hors-ligne.md).

### Organisation

- `packages/*` : paquets du monorepo (workspaces npm), publiés sous `@contextvault/<nom>`.
- `tools/` : outils du dépôt (contrôle de licences, vérification de l'image Docker).
- `dev/` : configuration et vaults fictifs du docker-compose de développement, royaume Keycloak.
- `docs/` : cahier des charges, décisions, backlog.

### Licences des dépendances

Le cœur est sous Apache 2.0 (décision T4) : aucune dépendance GPL, LGPL ou AGPL n'est acceptée, ni une dépendance dont la licence est inconnue. Une licence à choix (`MIT OR GPL-3.0`) passe si l'une des branches est autorisée. Une exception validée par le RSSI se déclare dans `.license-exceptions.json` :

```json
[{ "name": "paquet", "version": "1.2.3", "reason": "Validé par le RSSI le JJ/MM/AAAA" }]
```

## Licence

Apache 2.0, voir [LICENSE](LICENSE).
