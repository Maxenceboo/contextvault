# Décisions : Banque de Contextes Multi-Vaults

## Q1. Identité et rôles — DÉCIDÉ (10/11/2026)
Serveur central HTTP. Authentification SSO OIDC (Keycloak / Entra ID) via le flux OAuth du transport HTTP MCP.
Les rôles sont résolus côté serveur à partir des groupes de l'annuaire. Aucun rôle n'est déclaré par le client ni par le LLM.
Clients sans OAuth (LLM locaux) : jeton personnel par utilisateur, émis derrière le SSO, révocable, à durée limitée ; il identifie l'utilisateur, les rôles restent calculés côté serveur.
Mode stdio : réservé au développement et aux démos.

## Q2. Gestion de l'équipe habilitée — DÉCIDÉ (10/11/2026)
Un groupe d'annuaire par vault (ex. `vault-client-0042`). `access_roles` ne contient que des noms de groupes, jamais de personnes.
Demande : chef de projet. Validation/exécution : IT/RSSI via le circuit de demande d'accès. Revue trimestrielle, groupe vidé en fin de projet.
Prise d'effet : ajout à la prochaine connexion ; retrait ≤ 15 min (jetons 15 min, cache groupes ≤ 5 min) ; révocation immédiate en désactivant le compte dans l'annuaire.
Pas de super-admin implicite : un admin doit être membre du groupe du client. Accès d'urgence (break-glass) par rôle dédié, journalisé et notifié au RSSI.

## Q3. Accès aux vaults parents — DÉCIDÉ (10/11/2026)
Mode strict : un vault hérité n'est inclus que si l'utilisateur y a aussi accès. L'héritage est une règle de config, pas une autorisation.
Garde-fou 1 : au démarrage, le serveur signale chaque vault dont le groupe n'a pas accès à un parent.
Garde-fou 2 : la réponse indique « N source(s) héritée(s) non accessible(s) avec vos droits », sans nom ni contenu.

## Q4. Source de vérité ACL / héritage — DÉCIDÉ (10/11/2026)
`vaults.config.json` fait foi. Versionné dans git, chaque modification relue et validée par IT/RSSI.
La fiche client ne contient plus de section accès ni héritage. Le serveur ajoute un en-tête calculé depuis la config (vault, héritage, confidentialité) quand il sert la fiche.
Une section d'accès trouvée dans une fiche est ignorée et signalée dans les logs.

## Q5. Niveaux de confidentialité — DÉCIDÉ (10/11/2026)
Trois niveaux déclarés dans la config : Interne, Élevé, Critique. Vault sans niveau = Élevé.
- Interne : tous clients IA, RAG au choix, pas d'audit, identifiant lisible, SSO.
- Élevé : clients IA sous contrat entreprise (sans entraînement), embeddings internes uniquement, audit, identifiant neutre, SSO.
- Critique : LLM hébergé en interne uniquement, embeddings internes ou RAG désactivé, audit + alerte volume anormal, identifiant neutre, SSO + MFA, jetons courts.
Les clients IA sont enregistrés ; liste des clients approuvés par niveau dans la config ; le serveur refuse les autres.
Un vault ne peut pas hériter d'un vault de niveau supérieur.

## Q6. Journal d'audit — DÉCIDÉ (10/11/2026)
Une ligne JSON par appel : date, utilisateur, client IA, action, vault, documents renvoyés (chemin + version), résultat, nb d'extraits, latence.
Jamais le texte des questions ni les extraits (§2.2).
Refus tracés à tous les niveaux ; refus répétés => alerte RSSI.
Envoi en continu vers le SIEM de l'entreprise ; rien dans les vaults ni l'index ; accès RSSI seul ; non modifiable.
Conservation 6 mois à 1 an (recommandation CNIL). Inscription au registre RGPD et information des équipes.

## Q7. Identifiant neutre — DÉCIDÉ (10/11/2026)
Tous les vaults client ont un identifiant neutre (code court aléatoire, ex. `client-7f3a`), quel que soit le niveau. Vaults transverses : nom lisible.
Neutre : id du vault, dossier, groupe d'annuaire, logs, audit, SIEM. Vrai nom dans `display_name` de la config, visible seulement des membres du groupe.
Le contenu des documents n'est pas réécrit. Option Critique : remplacement par nom de code via `formatContextChunk`.

## Q8. Données personnelles dans les vaults — DÉCIDÉ (10/11/2026)
Toléré : contacts professionnels du projet (nom, rôle, email pro), minimisés.
Interdit : données des utilisateurs finaux du client (formulaires, exports de base, logs de prod, fichiers clients). Jeux d'exemple fictifs.
Contrôle à l'indexation via hook (emails en masse, téléphones, IBAN, NIR, IP) : au-delà d'un seuil, fichier non indexé + alerte auteur et RSSI.
Effacement : suppression/correction du fichier source, purge de l'index au rescan suivant, aucune copie ailleurs.
Organisation : inscription au registre via le DPO ; AIPD si vaults Critique.

## Q9. Cycle de vie des vaults — DÉCIDÉ (10/11/2026)
Champ `status` : prospect, actif, maintenance, archivé. Date de revue dans la config ; dépassée => signalement aux admins.
Prospect perdu : suppression (défaut 6 mois après la perte, ou selon l'accord de confidentialité).
Projet terminé : sortie de l'index (embeddings compris), groupe vidé, aucun accès IA ; fichiers conservés en lecture seule hors serveur pendant la durée contractuelle (défaut 5 ans) ; puis suppression tracée dans l'audit.
Réactivation sur demande du chef de projet (même circuit que les accès).
Capitalisation avant archivage : retours d'expérience anonymisés et relus versés dans `_global-socle` ou un vault de pôle.

## Q10. Cible de déploiement — DÉCIDÉ (10/11/2026)
Serveur central unique hébergeant les vaults ; les équipes s'y connectent et n'accèdent qu'aux vaults autorisés.
Mode stdio conservé uniquement pour développer l'outil, avec des vaults fictifs.

## Q11. Version de Node — DÉCIDÉ (10/11/2026, découle de Q10)
Contrainte limitée au serveur : livré en image Docker avec une version LTS de Node (22+). Rien à installer côté postes des devs.

## Q12. Volumétrie cible — DÉCIDÉ (10/11/2026)
Hypothèse « grand groupe » : ~100 vaults projets, quelques milliers de documents par vault (100k à 500k docs, 1 à 5 M d'extraits), milliers d'employés, 100 à 500 utilisateurs simultanés, pics de 50 à 100 requêtes/s (les agents enchaînent plusieurs appels).
Conséquences :
- Un index SQLite par vault (et non un index global) : chaque recherche ne touche que 2-3 petits index ; isolation physique ; archivage = suppression d'un fichier.
- Serveur sans état et en lecture seule => plusieurs instances derrière un répartiteur ; requêtes SQLite en worker threads.
- Stockage derrière une interface : SQLite par défaut (plug & play), adaptateur PostgreSQL + pgvector pour les grands comptes.
- RAG : index vectoriel dédié (sqlite-vec ou pgvector) ; serveur GPU interne pour les embeddings (indexation initiale de plusieurs millions d'extraits).
- Grand groupe : une instance par BU/pays possible, avec `_global-socle` synchronisé.

## Q13. RAG et fournisseur d'embeddings — DÉCIDÉ (10/11/2026)
RAG désactivé par défaut ; activable globalement puis par vault (`enable_rag` par vault). La recherche texte FTS5 reste toujours disponible.
Aucun fournisseur codé en dur : endpoint compatible OpenAI `/embeddings` configurable (+ hook `embed()`).
Production : serveur d'inférence interne (TEI, vLLM ou Ollama serveur ; LM Studio réservé aux postes de dev). Modèle multilingue FR/EN open source, par défaut bge-m3 (alternatives : multilingual-e5-large, Qwen3-Embedding).
API externes (Mistral, Azure OpenAI UE, OpenAI) : autorisées uniquement pour les vaults Interne. Élevé et Critique : modèle interne uniquement.
Un seul modèle d'embeddings par instance, enregistré dans l'index ; changement de modèle = re-vectorisation complète ; incohérence détectée => recherche vectorielle refusée, repli sur le texte.
Les vecteurs ont le même niveau de confidentialité que le texte (partiellement réversibles).
Complément Q13 : le modèle n'est pas embarqué dans le serveur Node. Le client fournit son endpoint d'embeddings (cas grand groupe : plateforme IA interne existante). Pour le plug & play, livraison d'un profil docker-compose optionnel « rag » qui démarre TEI + bge-m3 (licence MIT) à côté du serveur.

## Q14. Mise à jour de l'index — DÉCIDÉ (10/11/2026)
Indexeur séparé (un seul processus qui écrit) ; les serveurs MCP ne font que lire les index.
Déclenchement par événement : webhook git à la fusion (ou notification de la source) => réindexation des seuls fichiers modifiés du vault. Filet de sécurité : réconciliation complète nocturne. Commande admin « réindexer le vault X ».
Pas de surveillance de fichiers sur partage réseau (peu fiable sur NFS/SMB).
Reconstruction atomique : nouvel index construit à côté puis bascule, les serveurs ne voient jamais d'index à moitié construit.
Objectif de fraîcheur : quelques minutes. Les suppressions (RGPD, Q8) sont propagées en priorité. Le contrôle des données personnelles (Q8) s'exécute dans l'indexeur.

## Q15. Fiche contexte client — DÉCIDÉ (10/11/2026)
Convention : un fichier `_CONTEXT.md` à la racine de chaque vault, limité à ~1 500 tokens (2 pages).
Pas de fiche complète répétée dans chaque recherche (gaspillage de tokens, le serveur sans état ne sait pas si elle a déjà été envoyée).
- Outil MCP dédié `get_vault_context(vault)` : renvoie la fiche complète + l'en-tête calculé depuis la config (Q4). Exposée aussi comme ressource MCP.
- Les instructions du serveur MCP demandent à l'IA de l'appeler en premier sur un nouveau vault.
- Chaque réponse de recherche commence par un en-tête court (~100 tokens) : vault, niveau, résumé de la fiche, rappel de get_vault_context.

## Q16. Conflit entre vault client et `_global-socle` — DÉCIDÉ (10/11/2026)
Deux catégories de documents dans le socle, déclarées en en-tête (frontmatter `priority`) :
- `mandatory` (sécurité, légal, RGPD, secrets, OWASP...) : gagne toujours, sauf dérogation écrite.
- `default` (stack, conventions, templates, outillage) : le client gagne.
Ordre de priorité : socle obligatoire > client > socle par défaut. Une règle client plus stricte qu'une règle obligatoire s'applique (elle ne la contredit pas).
Dérogations à une règle obligatoire : fichier `_DEROGATIONS.md` dans le vault client, validé par le RSSI/l'architecte référent, avec date d'expiration.
Le serveur ne tranche pas le sens des textes : il étiquette chaque extrait ([Règle obligatoire ESN] / [Spécifique client] / [Standard ESN, surchargeable]) et les instructions MCP donnent l'ordre de priorité à l'IA.

## Q17. Connecteurs — DÉCIDÉ (10/11/2026)
Principe : un connecteur est un importateur, pas un accès en direct. Il convertit la source en fichiers Markdown déposés dans le vault (git), qui passent ensuite par le même circuit (relecture, contrôle données personnelles, indexation, ACL du vault, priorités Q16).
V1 : fichiers Markdown/texte + conversion PDF et Word (.docx) à l'indexation (format le plus courant des specs client).
V2 : Confluence (un espace = un vault ; pages à restrictions propres non importées). 
SQL : uniquement le schéma (tables, colonnes, commentaires) exporté en Markdown, jamais les données (risque données personnelles, Q8). V2.
Hook `loadDocuments()` documenté pour les connecteurs maison.

## Q18. API REST — DÉCIDÉ (10/11/2026)
V1 : MCP pour les IA + endpoints techniques seulement : santé, métriques, webhook de réindexation (Q14), admin « réindexer le vault X » (réservé admins).
V2 : API REST de recherche en lecture seule, miroir exact des outils MCP (mêmes opérations, description OpenAPI), pour les plateformes IA internes et chatbots qui ne parlent pas MCP.
Règle d'architecture : MCP et REST sont deux façades minces sur le même moteur ; authentification, ACL, niveaux et audit appliqués dans le moteur, jamais dans la façade. Aucune écriture exposée, quelle que soit la façade.

## Q19. Hooks surchargeables — DÉCIDÉ (10/11/2026)
Liste figée (API publique, versionnée en semver ; une méthode dépréciée reste disponible une version majeure entière ; suite de tests de contrat livrée pour vérifier les overrides avant mise à jour).
Identité et accès : resolveUserRoles, authenticateToken, resolveVaultAccess, isClientAllowed.
Contenu : computeInheritance, loadDocuments, convertDocument, extractMetadata, detectPersonalData, chunkDocument.
Recherche et rendu : embed, rankResults, formatContextChunk, formatVaultContext.
Exploitation : onAuditEvent, onAlert.
Invariants non surchargeables (appliqués par le cœur après les hooks) : lecture seule, statut archivé, niveau de confidentialité et clients IA autorisés, contrôle des chemins, émission de l'audit.
Un accès accordé par une extension alors que la règle par défaut l'aurait refusé est tracé spécifiquement dans l'audit.

## Q20. Qui écrit dans les vaults, et par quel circuit — DÉCIDÉ (10/11/2026)
Un dépôt git par vault (GitLab / GitHub Enterprise interne), droits du dépôt alignés sur le même groupe d'annuaire que le vault (Q2).
Branche principale protégée : seule la branche principale est indexée (webhook à la fusion, Q14).
Écriture par demande de fusion relue :
- vault client : tout membre de l'équipe propose ; relecture par le tech lead ou le chef de projet ;
- `_global-socle` : relecture par la cellule architecture ; docs `mandatory` (Q16) et `_DEROGATIONS.md` : validation RSSI obligatoire (CODEOWNERS).
Profils non techniques : éditeur web du gitlab, ou dossier de dépôt Word/PDF converti (Q17) qui ouvre automatiquement une demande de fusion.
L'IA peut rédiger un brouillon (ex. retour d'expérience), mais seulement comme proposition soumise par un humain, sous son nom ; jamais d'écriture directe (§2.2).
