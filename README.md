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

La CI (`.github/workflows/ci.yml`) lance ces cinq étapes sur chaque demande de fusion.

### Organisation

- `packages/*` : paquets du monorepo (workspaces npm), publiés sous `@contextvault/<nom>`.
- `tools/` : outils du dépôt (contrôle de licences).
- `docs/` : cahier des charges, décisions, backlog.

### Licences des dépendances

Le cœur est sous Apache 2.0 (décision T4) : aucune dépendance GPL, LGPL ou AGPL n'est acceptée, ni une dépendance dont la licence est inconnue. Une licence à choix (`MIT OR GPL-3.0`) passe si l'une des branches est autorisée. Une exception validée par le RSSI se déclare dans `.license-exceptions.json` :

```json
[{ "name": "paquet", "version": "1.2.3", "reason": "Validé par le RSSI le JJ/MM/AAAA" }]
```

## Licence

Apache 2.0, voir [LICENSE](LICENSE).
