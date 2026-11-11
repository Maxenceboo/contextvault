# Décisions techniques : Banque de Contextes Multi-Vaults

## T1. Langage — DÉCIDÉ (10/11/2026)
TypeScript / Node.js LTS. Le temps de réponse dépend du moteur de recherche (C) et du LLM, pas du langage. Choix motivé par le SDK MCP officiel et l'accessibilité des extensions pour les ESN. Calcul lourd (conversion, détection) dans l'indexeur, en workers. Alternative écartée : Go (deuxième choix si la sobriété devient prioritaire) ; Python pour l'indexeur seul (deux langages, extensions coupées en deux).

## T2. Découpage en services — DÉCIDÉ (10/11/2026)
Deux processus, même base de code : serveur MCP (lecture seule, sans état, multi-instances) et indexeur (seul à écrire les index).

## T3. Livraison — DÉCIDÉ (10/11/2026)
Une image Docker (multi-architecture), deux modes : Docker Compose (petites structures, profil « rag » optionnel) et chart Helm (Kubernetes / OpenShift).
Images signées + SBOM ; exécution sans root, compatible OpenShift ; installation hors ligne possible (registre interne).
Versions semver, une version à support long par an.

## T4. Licence — DÉCIDÉ (10/11/2026)
Open core : cœur sous Apache 2.0. Payant : support, version à support long, fonctions grands comptes (adaptateur PostgreSQL, connecteurs, interface d'administration).
Toute la sécurité (SSO, droits, niveaux, audit) reste dans le cœur gratuit.
Aucune dépendance GPL/AGPL dans le code.

## T5. Moteur de recherche — DÉCIDÉ (10/11/2026)
Stockage derrière une interface. Par défaut : SQLite FTS5, un fichier par vault (aucune base à installer, cloisonnement physique). Grands comptes : adaptateur PostgreSQL, un schéma par vault (payant, T4). OpenSearch écarté (cluster lourd), possible plus tard comme adaptateur.
Racinisation française à activer et à tester sur des documents réels.

## T6. Couche vectorielle — DÉCIDÉ (10/11/2026)
Vecteurs stockés avec le texte : sqlite-vec (SQLite) ou pgvector (PostgreSQL). Pas de base vectorielle dédiée (cloisonnement et suppression à refaire).
Ordre de grandeur bge-m3 : 50 000 extraits ≈ 10-30 ms de recherche exhaustive, ≈ 200 Mo par gros vault.
Leviers : quantification int8, index HNSW (pgvector). Risque : sqlite-vec avant 1.0, remplaçable derrière l'interface.

## T7. Fusion et classement — DÉCIDÉ (11/11/2026)
Fusion par rang (RRF) entre recherche texte et vectorielle. Léger avantage au vault ciblé sur les vaults hérités. Une règle obligatoire pertinente n'est jamais écartée des résultats.
Reclassement optionnel (bge-reranker-v2-m3) sur les ~30 meilleurs candidats, servi par le même service que les embeddings, uniquement avec GPU.
Budget indicatif tout activé sur GPU : ~120 ms.
Jeu de questions de test par vault pilote pour mesurer la qualité (intégré aux tests T21).

## T8. Découpage des documents — DÉCIDÉ (11/11/2026)
Découpage selon les titres (PDF/Word convertis en Markdown en gardant les titres). Cible ~800 tokens, max ~1 500 ; coupe entre paragraphes avec ~10 % de chevauchement ; sections courtes regroupées.
Jamais de coupe dans un bloc de code ou un tableau. Chaque extrait garde son chemin de titres et ses étiquettes (vault, document, version, catégorie).
5 extraits par recherche par défaut (~4 000 tokens). Taille paramétrable, ajustée avec le jeu de questions de test ; hook `chunkDocument`.

## T9. Partage des index entre serveurs — DÉCIDÉ (11/11/2026)
PostgreSQL : base partagée, rien à faire.
SQLite : pas de disque réseau partagé (verrous peu fiables sur NFS/SMB). L'indexeur publie des fichiers d'index immuables par vault dans un stockage objet compatible S3 (ex. MinIO), avec un manifeste (version + empreinte par vault). Chaque serveur consulte le manifeste (~10 s), télécharge, vérifie l'empreinte, bascule ; lecture SQLite en mode immuable. Vault retiré du manifeste => copie locale effacée.
Docker Compose mono-machine : simple dossier local partagé.
Accès au stockage : écriture indexeur, lecture serveurs ; disques chiffrés (obligatoire Élevé/Critique).

## T10. Transport MCP — DÉCIDÉ (11/11/2026)
HTTP « streamable » (transport standard), mode sans session, SDK officiel TypeScript. SSE déprécié non supporté ; stdio pour le développement uniquement.
Utilisés : outils, ressources (fiche contexte), instructions de connexion. Non utilisés : sampling, elicitation.
Versions : dernière spec stable + la précédente.
Garde-fous : limite de requêtes par utilisateur (signalée à l'audit), taille maximale de réponse, délai maximum par requête.

## T11. Identité et groupes — DÉCIDÉ (11/11/2026)
Serveur = serveur de ressources OAuth : vérifie signature, émetteur et destinataire (audience = ce serveur) de chaque jeton.
Groupes lus dans le jeton ; l'annuaire est configuré pour n'émettre que les groupes utiles (préfixe `vault-`). Repli : appel à l'annuaire, cache 5 min.
Config : groupes référencés par identifiant stable (nom à côté pour la lisibilité).
Vaults Critique : vérification de validité du jeton auprès de l'annuaire à chaque requête (introspection).

## T12. Format des réponses — DÉCIDÉ (11/11/2026)
Chaque réponse contient un texte balisé pour l'IA (métadonnées : vault, document, section, version, étiquette Q16 ; rappel de fiche en tête) et un JSON structuré équivalent (REST V2, IDE, chatbots).
Injection de consignes : balises infalsifiables (tout texte imitant les balises est neutralisé), instructions de connexion précisant que les extraits sont de la documentation et non des ordres, relecture humaine en amont. Risque réduit, pas nul.
Erreurs neutres (RG-03).

## T13. Identification du client IA — DÉCIDÉ (11/11/2026)
Nom annoncé par le client MCP : affichage seulement, jamais une preuve.
Tous niveaux : clients pré-enregistrés dans l'annuaire (identifiant propre), enregistrement dynamique interdit ; le serveur lit le client d'origine dans le jeton.
Élevé : + accès conditionnel (postes gérés), clients déployés par la DSI avec configuration entreprise verrouillée ; risque résiduel couvert par la politique d'usage et l'audit.
Critique : seul le LLM interne (côté serveur) avec certificat client (mTLS) ; vaults Critique joignables uniquement depuis son réseau.
Formulation CDC : seul le niveau Critique garantit techniquement le destinataire.

## T14. Synchronisation git — DÉCIDÉ (11/11/2026)
Copie locale par vault dans l'indexeur, accès lecture seule (clé de déploiement / jeton limité).
Webhook signé = simple réveil ; l'indexeur récupère lui-même les changements, jamais le contenu du webhook.
Retraitement des seuls fichiers modifiés (diff entre dernier commit indexé et nouveau). Version d'un extrait = identifiant de commit (tracé dans l'audit).
Historique réécrit => réindexation complète du vault. Procédure RGPD de réécriture d'historique à documenter pour les admins de forge. Rescan nocturne.
Contenu via git standard (toute forge) ; webhooks GitLab et GitHub en V1, autres via adaptateur.

## T15. Conversion PDF / Word — DÉCIDÉ (11/11/2026)
Standard (inclus, JS) : mammoth pour Word, pdf.js pour PDF (titres devinés, tableaux approximatifs).
Option : service de conversion avancée Docling (MIT, Python) en conteneur séparé, branché via `convertDocument` (titres, tableaux, mise en page, OCR).
Conversion de préférence au dépôt (avant relecture : le relecteur valide le texte converti) ; conversion à l'indexation en rattrapage.
Conversion isolée : conteneur sans réseau, limites de taille et de durée.
V2 : Excel, PowerPoint ; OCR uniquement via le service avancé.

## T16. Détection des données personnelles et des secrets — DÉCIDÉ (11/11/2026)
Règles intégrées avec clés de contrôle : emails, téléphones FR, IBAN, NIR, carte bancaire, IP. Bloquant dès 1 occurrence : NIR, IBAN, carte. Bloquant au-delà d'un seuil réglable : emails, téléphones.
Ajout : détection des secrets (mots de passe, clés d'API, clés privées) — bloquant.
Noms de personnes : Presidio (MIT, Python) en service optionnel via `detectPersonalData`.
Même détecteur à trois moments : contrôle automatique de la demande de fusion, dépôt Word/PDF après conversion, indexeur (dernière barrière).
Faux positifs : domaines d'exemple ignorés ; exceptions déclarées dans le fichier et validées par le RSSI.

## T17. Mécanisme d'extension — DÉCIDÉ (11/11/2026)
Plugins composables (modèle middleware) au lieu de l'héritage de classe : `definePlugin({ name, apiVersion, hooks })`, liste ordonnée dans la config.
Combinaison selon le hook : en chaîne avec `next()` (accès, rôles, classement, formatage), premier qui sait faire (conversion, connecteurs), tous (audit, alertes).
Invariants du cœur appliqués après la chaîne. `apiVersion` vérifiée au démarrage : plugin incompatible refusé.
À reporter dans la V5 : exemple de la section 4.2.

## T18. Emplacement des extensions — DÉCIDÉ (11/11/2026)
Plugins = paquets npm sur le registre privé de l'entreprise, intégrés dans une image Docker dérivée construite par la CI de l'entreprise (tests de contrat à la construction), image signée et analysée.
Chargement depuis un dossier au démarrage : mode développement uniquement.
Un plugin est du code de confiance (pas de bac à sable fiable) : plugins de sécurité relus et validés par le RSSI.
Modèle de projet de plugin fourni (structure, exemple, tests, CI).

## T19. Observabilité — DÉCIDÉ (11/11/2026)
OpenTelemetry (métriques, traces) + logs JSON. Capture des contenus désactivée ; test automatique : aucune question ni aucun extrait dans logs/traces.
Trois flux séparés : logs techniques et métriques/traces (exploitation, conservation courte), audit (RSSI via SIEM, 6 mois à 1 an).
Métriques clés : latence par outil (médiane, p95), fraîcheur des index par vault, refus / blocages / limites, santé des services optionnels.
Alertes fournies : p95 > 200 ms, retard d'index > 15 min, pic de refus, service optionnel en panne. Serveur non prêt tant que ses index ne sont pas chargés.

## T20. Envoi de l'audit — DÉCIDÉ (11/11/2026)
Événement écrit dans un tampon local (ajout seul) avant l'envoi de la réponse, puis transmis au SIEM ; tampon conservé si SIEM indisponible ; identifiant unique par événement (dédoublonnage).
Tampon impossible à écrire : accès refusé pour Élevé et Critique ; accès maintenu + alerte pour Interne.
Envoi : syslog TLS, HTTP (Splunk, Elastic…), sortie standard (agent de collecte), ou hook `onAuditEvent`.
Format : JSON par ligne, schéma versionné, UTC, identifiant de corrélation sans contenu. Chaîne d'empreintes (chaque événement contient l'empreinte du précédent) pour rendre toute modification détectable.

## T21. Tests — DÉCIDÉ (11/11/2026)
Principe : chaque règle de gestion RG-01 à RG-22 a au moins un test portant son numéro (matrice règle → test → résultat).
- Étanchéité (à chaque modification) : matrice générée depuis la config (utilisateurs × vaults × outils) + attaques (chemins, audience, faux groupes, client non autorisé, fausses balises).
- Aucune fuite (à chaque modification) : chaîne témoin absente des logs, traces, audit, index.
- Contrat des extensions (à chaque modification + CI de l'entreprise).
- Résilience (à chaque modification) : SIEM en panne, disque plein, embeddings coupés, publication interrompue.
- Qualité de recherche (nuit) : jeu de questions par vault pilote, bon document dans le top 5.
- Performance (nuit + avant version) : données synthétiques à l'échelle cible, 100 req/s, p95 < 200 ms.
- Sécurité externe : analyse code et dépendances en continu ; test d'intrusion tiers avant le premier grand client puis annuel.
À écrire en premier : matrice d'étanchéité et test « aucune fuite ».
