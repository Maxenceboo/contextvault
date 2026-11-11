# Questions ouvertes : Banque de Contextes Multi-Vaults (CDC V4)

> **Statut : toutes les questions sont tranchées** (11/11/2026). Voir `decisions.md` et le cahier des charges V5.2.

Proposition par défaut entre parenthèses. Déjà tranché par la fiche client type : héritage de `_global-socle` par défaut, lecture seule stricte sans persistance des chats (`read_only: false` supprimé), accès restreint à l'équipe projet habilitée.

## A. Identité et accès
1. Comment le serveur connaît-il les rôles de l'utilisateur ? (stdio : rôles fixés dans la config du client MCP ; serveur partagé : jeton ou OAuth/Keycloak ; jamais passés par le LLM.)
2. Qui gère « l'équipe habilitée » d'un client : groupe dans l'annuaire (AD/Keycloak) ou liste dans la config ? Qui ajoute/retire quelqu'un, et en combien de temps ça prend effet ?
3. Un utilisateur d'un vault client voit-il le contenu d'un vault parent auquel il n'a pas droit directement ? (Non, mode strict.)
4. Source de vérité de l'ACL et de l'héritage : `vaults.config.json` ou la fiche contexte du client ? (La config ; ou config générée depuis un en-tête de la fiche.)

## B. Confidentialité, audit et RGPD
5. Le niveau de confidentialité (« Élevé ») change-t-il le comportement ? (Oui : champ `confidentiality` qui interdit les embeddings externes, impose l'audit, masque le nom client.)
6. Faut-il un journal d'audit des accès, et où le stocker sans persister les conversations ? (Métadonnées seulement : utilisateur, vault, date, sans texte des requêtes.)
7. Identifiant neutre pour les vaults sensibles (ex. `client-0042` au lieu du nom) ? (Oui au niveau Élevé.)
8. Les vaults peuvent-ils contenir des données personnelles ? Si oui : droit à l'effacement dans l'index et durée de conservation. (Interdit : doc technique uniquement.)
9. Cycle de vie : que devient le vault d'un prospect qui ne signe pas ou d'un projet terminé ? (Archivé, accès coupé.)

## C. Déploiement
10. Cible : poste de chaque dev (stdio), serveur central (HTTP), ou les deux ? (Les deux, stdio d'abord.)
11. Version minimale de Node ? (22.13+, SQLite intégré sans compilation.)
12. Ordre de grandeur visé : nombre de vaults, de documents, d'utilisateurs simultanés ? (Sert à valider les 200 ms.)

## D. Recherche, RAG et contenu
13. Fournisseur d'embeddings, et droit d'envoyer les docs clients à une API externe ? (API compatible OpenAI pointée sur un modèle local LM Studio/Ollama.)
14. Mise à jour de l'index quand un doc change ? (Automatique, rescan périodique léger.)
15. La fiche contexte client est-elle injectée automatiquement en tête de chaque recherche, ou traitée comme un document normal ? (Injection automatique.)
16. Si une règle du client contredit `_global-socle`, qui gagne ? (Le client, premier dans la chaîne d'héritage.)

## E. Périmètre V1
17. Connecteurs (Confluence, SQL, PDF/Word) en V1, ou seulement un point d'extension ? (Point d'extension + 1 connecteur prioritaire si besoin.)
18. « API middleware » (section 1.2) : une API REST en plus du MCP ? (Non en V1.)
19. Hooks surchargeables : uniquement les 3 cités, ou aussi découpage, indexation, authentification ? (Liste élargie, figée et versionnée.)

## F. Ajoutées en cours de revue
20. Qui a le droit de modifier le contenu d'un vault client (humains), et par quel circuit : dépôt git relu, partage réseau, Confluence ?
