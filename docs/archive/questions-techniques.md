# Questions techniques : Banque de Contextes Multi-Vaults

> **Statut : toutes les questions sont tranchées** (11/11/2026). Voir `decisions-techniques.md` et le cahier des charges V5.2.

Proposition par défaut entre parenthèses. Base : documentation fonctionnelle validée et décisions Q1 à Q20.

## A. Architecture et code
T1. Langage : TypeScript / Node.js comme dans le cahier des charges ? (Oui, Node LTS.)
T2. Un service ou deux : serveur MCP et indexeur séparés ? (Deux processus, même base de code.)
T3. Livraison : image Docker seule, ou aussi un chart Helm pour Kubernetes ? (Docker Compose + Helm.)
T4. Licence : open source ou propriétaire ? Ça conditionne les dépendances utilisables. (À décider par toi.)

## B. Stockage et recherche
T5. Moteur par défaut : SQLite FTS5 (un fichier par vault), PostgreSQL, ou OpenSearch ? (SQLite par vault par défaut, adaptateur PostgreSQL pour les grands comptes.)
T6. Couche vectorielle : sqlite-vec, pgvector ou base dédiée (Qdrant) ? (sqlite-vec / pgvector selon l'adaptateur.)
T7. Recherche hybride : méthode de fusion texte + vecteurs, et reclassement (reranker) ? (Fusion RRF, reranker optionnel.)
T8. Découpage des documents : par titres Markdown + taille max ? (Oui, ~1 000 tokens avec chevauchement léger.)
T9. Partage des index entre instances : volume partagé en lecture, copie par instance, stockage objet ? (À débattre.)

## C. Protocole et sécurité
T10. Transport MCP : HTTP « streamable », SDK officiel, serveur sans session ? (Oui.)
T11. OAuth : le serveur valide les jetons de l'IdP (Keycloak / Entra) ; groupes lus dans le jeton ou via l'API de l'annuaire ? (Dans le jeton, avec repli API si trop de groupes.)
T12. Format des réponses MCP : texte balisé, JSON structuré, ou les deux ? (Les deux.)
T13. Identification du client IA (pour les niveaux) : comment le reconnaître de façon fiable ? (Enregistrement OAuth par client, pas l'en-tête déclaré.)

## D. Sources et indexation
T14. Synchronisation git : clone local par vault + webhooks GitLab/GitHub ? (Oui.)
T15. Conversion PDF/Word : quelles librairies, et OCR des PDF scannés ? (Librairies JS en V1, OCR hors V1.)
T16. Détection des données personnelles : règles maison ou outil existant (Presidio) ? (Règles maison en V1, hook pour Presidio.)

## E. Extensions
T17. Mécanisme : héritage de classe (comme dans le CDC) ou hooks composables ? Problème : deux extensions de deux équipes ne peuvent pas hériter de la même classe en même temps. (Hooks composables, avec l'héritage gardé comme raccourci.)
T18. Chargement : extensions compilées dans l'image de l'entreprise, ou chargées au démarrage ? (Compilées dans une image dérivée.)

## F. Exploitation et qualité
T19. Observabilité : métriques, traces, logs ? (OpenTelemetry + logs JSON.)
T20. Envoi de l'audit au SIEM : syslog, HTTP, fichier ? (Syslog et HTTP.)
T21. Tests : étanchéité automatisée, banc de charge 200 ms, tests de contrat des extensions ? (Les trois, dans la CI.)
