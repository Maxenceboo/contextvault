# Cahier des Charges Fonctionnel et Technique : Système de Banque de Contextes Multi-Vaults avec Héritage, Plug & Play et Étanchéité Absolue

**Version 5.2** · 11/11/2026 · Nom du produit : **ContextVault** (dépôt `contextvault`). Intègre les décisions fonctionnelles Q1 à Q20 (`decisions.md`) et techniques T1 à T21 (`decisions-techniques.md`), et le plan de livraison du backlog (§7). Le détail technique est dans la documentation technique.

---

## 1. Vue d'ensemble et Objectifs

### 1.1 Contexte du Projet

Dans le cadre des activités d'une ESN (Entreprise de Services Numériques), les équipes techniques et fonctionnelles travaillent simultanément sur de multiples projets clients cloisonnés. Chaque projet nécessite un accès à de la documentation spécifique (spécifications, architectures, codes, retours d'expérience), tout en s'appuyant sur un socle de connaissances transverse et partagé (bonnes pratiques, templates, standards d'entreprise).

### 1.2 Objectif Principal

Concevoir un outil de **Banque de Contextes Multi-Vaults**, exposé aux assistants IA via le protocole MCP (et via une API REST en V2), qui soit :

* **Plug & Play :** installation rapide par image Docker et configuration minimale par défaut.
* **Sécurisé, Cloisonné & Imperméable :** isolation stricte des données par projet/client, avec des droits issus de l'annuaire de l'entreprise.
* **Hiérarchique avec Héritage :** un vault de projet hérite automatiquement des sources d'un ou plusieurs vaults globaux ou transverses.
* **Modulaire & Extensible (Override Pattern) :** les entreprises surchargent des comportements précis sans réécrire le cœur, sans pouvoir contourner ses garanties de sécurité.

### 1.3 Volumétrie cible

Le système est dimensionné pour un grand groupe :

| Grandeur | Cible |
|---|---|
| Vaults projets actifs | ~100 par instance |
| Documents | quelques milliers par vault (100 000 à 500 000 au total) |
| Extraits indexés | 1 à 5 millions |
| Utilisateurs | plusieurs milliers ; 100 à 500 simultanés |
| Charge | pics de 50 à 100 requêtes/s (un agent enchaîne plusieurs recherches) |

Un grand groupe peut déployer une instance par BU ou par pays, avec un `_global-socle` synchronisé entre instances.

### 1.4 Glossaire

* **Vault :** ensemble de documents servis à l'IA, avec ses propres droits. Un vault correspond à un dépôt git.
* **Socle (`_global-socle`) :** vault commun à toute l'ESN (standards, sécurité, templates), lisible par tous.
* **Vault client :** vault d'un projet, lisible par la seule équipe habilitée ; il hérite du socle.
* **Utilisateur (dev) :** personne qui interroge les vaults via son assistant IA. Il n'écrit jamais dans un vault via l'IA.
* **Client IA :** logiciel qui se connecte au serveur (Claude Desktop, IDE, LLM local, plateforme interne).

---

## 2. Architecture Fonctionnelle et Modèle de Données

### 2.1 Architecture de déploiement

* **Serveur central unique** par instance, hébergé dans l'infrastructure de l'entreprise (on-premise ou cloud souverain), en HTTPS derrière le reverse proxy de l'entreprise. Les équipes s'y connectent et n'accèdent qu'aux vaults autorisés. Aucun vault n'est copié sur les postes des utilisateurs.
* **Serveurs MCP sans état et en lecture seule**, déployables en plusieurs instances derrière un répartiteur de charge.
* **Indexeur séparé :** un seul processus écrit les index ; les serveurs ne font que les lire.
* **Mode stdio :** réservé au développement de l'outil, avec des vaults fictifs.
* **Sauvegarde :** les vaults (dépôts git) et la configuration. Les index et embeddings ne sont pas sauvegardés : ils se reconstruisent.

### 2.2 Sources documentaires et circuit d'écriture

* **Un dépôt git par vault** (GitLab / GitHub Enterprise interne). Les droits du dépôt sont alignés sur le groupe d'annuaire du vault.
* **Seule la branche principale (protégée) est indexée.** Toute modification passe par une demande de fusion relue :
  * vault client : proposée par un membre de l'équipe, relue par le tech lead ou le chef de projet ;
  * `_global-socle` : relue par la cellule architecture ;
  * documents de catégorie `mandatory` et fichiers `_DEROGATIONS.md` : validation RSSI obligatoire (CODEOWNERS).
* **Profils non techniques :** éditeur web de la forge, ou dossier de dépôt où un Word/PDF déposé est converti et ouvre automatiquement une demande de fusion.
* **Formats :** Markdown et texte ; PDF et Word (.docx) convertis à l'indexation (V1).
* **Connecteurs :** un connecteur est un **importateur**, jamais un accès en direct. Il convertit la source en Markdown déposé dans le vault, qui suit ensuite le circuit normal (relecture, contrôle des données personnelles, indexation, droits du vault).
  * V2 : Confluence (un espace = un vault ; les pages ayant leurs propres restrictions ne sont pas importées).
  * V2 : bases SQL, **schéma uniquement** (tables, colonnes, commentaires), jamais les données.
  * Connecteurs maison via le hook `loadDocuments()`.

### 2.3 Recherche : texte par défaut, RAG optionnel

* **Recherche plein texte (SQLite FTS5) toujours disponible.**
* **RAG désactivé par défaut**, activable globalement puis **vault par vault**.
* **Embeddings fournis par l'entreprise** via une API compatible OpenAI (`/embeddings`). Le modèle n'est pas embarqué dans le serveur.
  * Grand groupe : endpoint de la plateforme IA interne existante.
  * Petite structure : profil docker-compose optionnel « rag » livré (TEI + bge-m3, licence MIT).
  * Modèle recommandé : multilingue FR/EN (bge-m3 ; alternatives : multilingual-e5-large, Qwen3-Embedding).
* **Un seul modèle d'embeddings par instance**, enregistré dans l'index. Changer de modèle impose une revectorisation complète. En cas d'incohérence, la recherche vectorielle est coupée et le serveur repasse en recherche texte.
* **Les vecteurs sont aussi sensibles que le texte** (partiellement réversibles) : même cloisonnement, même niveau, même suppression.

### 2.4 Indexation et fraîcheur

* **Un index par vault** (et non un index global) : chaque recherche ne touche que le vault ciblé et ses parents ; isolation physique entre clients ; archiver un vault revient à supprimer son index.
* **Mise à jour par événement :** un webhook git à la fusion déclenche la réindexation des seuls fichiers modifiés. Objectif de fraîcheur : quelques minutes.
* **Réconciliation complète nocturne** comme filet de sécurité ; commande admin « réindexer le vault X ».
* **Bascule atomique :** le nouvel index est construit à côté de l'ancien, puis il le remplace d'un coup.
* **Suppressions prioritaires** (notamment pour le RGPD).
* Pas de surveillance de fichiers sur partage réseau (peu fiable sur NFS/SMB).

### 2.5 Étanchéité conversationnelle (anti-pollution du contexte)

* **Lecture seule stricte :** aucune opération d'écriture n'est exposée, quelle que soit la façade (MCP ou REST). Le champ `read_only` de la V4 est supprimé : il n'existe pas de vault inscriptible.
* **Isolation de la session :** le serveur ne conserve aucune conversation, question ou réponse. Le journal d'audit ne contient pas le texte des requêtes.
* **L'IA peut aider à rédiger** (ex. retour d'expérience), mais seul un humain soumet la proposition, sous son nom, et elle passe en relecture.

### 2.6 Identité et droits d'accès

* **Authentification :** SSO OIDC (Keycloak, Entra ID…) via le flux OAuth du transport HTTP MCP.
* **Rôles résolus côté serveur** à partir des groupes de l'annuaire. **Aucun rôle n'est déclaré par le client IA ni par le LLM.**
* **Clients IA sans OAuth** (LLM locaux) : jeton personnel par utilisateur, émis depuis un portail derrière le SSO, révocable et à durée limitée. Il identifie l'utilisateur ; ses rôles restent calculés côté serveur.
* **Un groupe d'annuaire par vault** (ex. `vault-client-7f3a`). `access_roles` ne contient que des noms de groupes, jamais de personnes.
  * Demande d'accès : chef de projet. Validation et exécution : IT/RSSI via le circuit habituel.
  * Revue trimestrielle des membres ; groupe vidé en fin de projet.
* **Délais de prise d'effet :** ajout à la prochaine connexion ; retrait en 15 minutes au plus (jetons de 15 minutes, groupes en cache 5 minutes au plus) ; révocation immédiate en désactivant le compte dans l'annuaire.
* **Pas de super-admin implicite :** un administrateur doit être membre du groupe d'un client pour en voir le contenu. Un accès d'urgence (« break-glass ») passe par un rôle dédié, journalisé et notifié au RSSI à chaque usage.

### 2.7 Héritage

* La chaîne d'héritage est : le vault ciblé, puis ses parents dans l'ordre déclaré (profondeur d'abord, sans doublon). Cycles et parents inconnus sont refusés au démarrage.
* **Mode strict :** un vault hérité n'est inclus que si l'utilisateur y a aussi accès. L'héritage est une règle de configuration, pas une autorisation.
* **Contrôle au démarrage :** le serveur signale chaque vault dont le groupe n'a pas accès à l'un de ses parents.
* **Information sans fuite :** si une source héritée est filtrée, la réponse indique « N source(s) héritée(s) non accessible(s) avec vos droits », sans nom ni contenu.
* **Un vault ne peut pas hériter d'un vault de niveau de confidentialité supérieur au sien.**

### 2.8 Niveaux de confidentialité

Chaque vault déclare un niveau. **Un vault sans niveau déclaré est traité comme Élevé.**

| | Interne | Élevé | Critique |
|---|---|---|---|
| Exemple | `_global-socle`, pôles métier | projet client standard | défense, santé… |
| Clients IA autorisés | tous | clients sous contrat entreprise (sans entraînement sur les données) | LLM hébergé en interne uniquement |
| Embeddings (RAG) | au choix, API externe permise | modèle interne uniquement | modèle interne, ou RAG désactivé |
| Journal d'audit | refus uniquement | complet | complet + alerte sur volume anormal |
| Authentification | SSO | SSO | SSO + MFA, jetons plus courts |

* Les clients IA sont enregistrés ; la liste des clients autorisés par niveau figure dans la configuration. Le serveur refuse de servir un vault à un client non autorisé pour son niveau.
* **Limite assumée :** le serveur ne peut pas empêcher un copier-coller manuel ; il bloque le cas courant et le trace.

### 2.9 Identifiants neutres

* **Tous les vaults client** ont un identifiant neutre (code court aléatoire, ex. `client-7f3a`), quel que soit leur niveau. Les vaults transverses gardent un nom lisible.
* L'identifiant neutre est utilisé pour l'id du vault, le dossier, le groupe d'annuaire, les logs, l'audit et le SIEM.
* Le vrai nom figure dans `display_name` et n'est affiché qu'aux membres du groupe.
* Le contenu des documents n'est pas réécrit. Option pour le niveau Critique : remplacement du nom par un nom de code via `formatContextChunk`.

### 2.10 Fiche contexte du vault

* Chaque vault contient un fichier **`_CONTEXT.md`** à sa racine (fiche client : périmètre, stack, contraintes, contacts), limité à environ 1 500 tokens.
* La fiche **ne déclare ni droits ni héritage** : la configuration fait foi. Une section d'accès trouvée dans une fiche est ignorée et signalée dans les logs.
* L'outil MCP **`get_vault_context`** renvoie la fiche, précédée d'un en-tête calculé depuis la configuration (vault, héritage, niveau). La fiche est aussi exposée comme ressource MCP.
* Les instructions de connexion du serveur MCP demandent à l'IA de lire ce contexte avant de travailler sur un vault.
* Chaque réponse de recherche commence par un en-tête court (~100 tokens) : vault, niveau, résumé de la fiche, renvoi vers `get_vault_context`.

### 2.11 Priorité entre socle, client et utilisateur

Les documents du socle déclarent leur catégorie dans leur en-tête (`priority`) :

* `mandatory` : sécurité, légal, RGPD, secrets, OWASP…
* `default` : stack, conventions, templates, outillage.

**Ordre de priorité :** socle obligatoire > vault client > demande de l'utilisateur dans sa conversation > socle par défaut.

* Une règle client plus stricte qu'une règle obligatoire s'applique (elle ne la contredit pas).
* **Dérogation** à une règle obligatoire : fichier `_DEROGATIONS.md` dans le vault client, validé par le RSSI ou l'architecte référent, avec date d'expiration.
* Le serveur n'interprète pas le sens des textes. Il **étiquette** chaque extrait (« Règle obligatoire ESN », « Spécifique client », « Standard ESN, remplaçable ») et donne l'ordre de priorité à l'IA dans ses instructions de connexion.

### 2.12 Données personnelles (RGPD)

* **Tolérées :** coordonnées professionnelles des interlocuteurs du projet (nom, rôle, email pro), limitées au strict utile.
* **Interdites :** données des utilisateurs finaux du client (envois de formulaires, exports de base, logs de production, fichiers clients). Les jeux de données d'exemple sont fictifs.
* **Contrôle à l'indexation** (hook `detectPersonalData`) : emails en masse, téléphones, IBAN, NIR, adresses IP. Au-delà d'un seuil, le fichier n'est pas indexé et l'auteur et le RSSI sont alertés.
* **Droit à l'effacement :** suppression ou correction du fichier source, puis purge de l'index (texte et vecteurs) en priorité. Aucune copie n'est conservée ailleurs.
* **Organisation :** l'outil traite des données personnelles (identités des salariés, audit). Il doit être inscrit au registre des traitements via le DPO, avec une AIPD si des vaults Critique sont concernés.

### 2.13 Journal d'audit

* **Une ligne JSON par appel :** date, utilisateur, client IA, action, vault, **documents renvoyés (chemin et version)**, résultat (accordé/refusé), nombre d'extraits, latence.
* **Jamais** le texte des questions ni les extraits.
* Les refus sont tracés pour tous les niveaux ; des refus répétés déclenchent une alerte RSSI.
* Les accès accordés par une extension alors que la règle par défaut les aurait refusés sont tracés à part.
* Envoi en continu vers le SIEM de l'entreprise (hook `onAuditEvent`) ; rien n'est stocké dans les vaults ni dans l'index ; accès réservé au RSSI ; entrées non modifiables.
* **Conservation :** 6 mois à 1 an (recommandation CNIL pour les journaux d'accès).

### 2.14 Cycle de vie des vaults

Champ `status` : `prospect`, `actif`, `maintenance`, `archivé`, avec une date de revue. Une date dépassée est signalée aux administrateurs.

* **Prospect perdu :** suppression du vault 6 mois après la perte, ou selon l'accord de confidentialité.
* **Projet terminé :**
  1. Capitalisation : le chef de projet extrait les retours d'expérience utiles, anonymisés et relus, vers `_global-socle` ou un vault de pôle.
  2. Archivage : le vault sort de l'index (vecteurs compris), le groupe est vidé, aucune IA n'y a plus accès.
  3. Conservation des fichiers en lecture seule, hors serveur, pendant la durée contractuelle (5 ans par défaut).
  4. Suppression à l'échéance, tracée dans l'audit.
* **Maintenance (TMA) :** le vault reste servi, à une équipe souvent réduite.
* **Réactivation** sur demande du chef de projet, par le même circuit que les accès.

### 2.15 Configuration centralisée (`vaults.config.json`)

La configuration est **la source de vérité** pour les droits, l'héritage, les niveaux et le cycle de vie. Elle est versionnée dans git ; chaque modification est relue et validée par l'IT ou le RSSI.

```json
{
  "version": "2.0.0",
  "settings": {
    "enable_rag": false,
    "rag": {
      "endpoint": "https://embeddings.interne.example/v1",
      "model": "bge-m3"
    },
    "allowed_clients": {
      "interne": ["*"],
      "eleve": ["claude-enterprise", "copilot-enterprise", "llm-interne"],
      "critique": ["llm-interne"]
    }
  },
  "vaults": [
    {
      "id": "_global-socle",
      "display_name": "Socle ESN",
      "source": "git@forge.interne:vaults/global-socle.git",
      "inherits": null,
      "access_roles": ["all"],
      "level": "interne",
      "status": "actif"
    },
    {
      "id": "client-7f3a",
      "display_name": "Client exemple",
      "source": "git@forge.interne:vaults/client-7f3a.git",
      "inherits": ["_global-socle"],
      "access_roles": ["vault-client-7f3a"],
      "level": "eleve",
      "status": "actif",
      "review_date": "2027-06-30",
      "enable_rag": false
    }
  ]
}
```

Validation au démarrage : identifiants uniques, parents existants, absence de cycle, héritage compatible avec les niveaux, index hors des vaults.

---

## 3. Spécifications Techniques

### 3.1 Stack

* **Langage :** TypeScript / Node.js (LTS 22+), livré en **image Docker**. Rien à installer sur les postes.
* **Stockage et recherche :** derrière une interface de stockage.
  * Par défaut : **SQLite + FTS5, un fichier par vault** (SQLite intégré à Node, sans compilation native) ; couche vectorielle optionnelle (sqlite-vec).
  * Grand compte : **adaptateur PostgreSQL + pgvector**.
* **Interface agent :** serveur **MCP** natif (transport HTTP, OAuth), compatible Claude Desktop, IDE, LM Studio et autres.
* **Performance :** requêtes SQLite exécutées en worker threads ; plusieurs instances derrière un répartiteur de charge ; redémarrage automatique, haute disponibilité selon l'usage.
* **Deux processus, une base de code (T2) :** serveur MCP (lecture seule, sans état, N instances) et indexeur (seul à écrire, une instance).
* **Livraison (T3) :** une image Docker multi-architecture, deux modes : Docker Compose (petites structures, profil `rag` optionnel) et chart Helm (Kubernetes, OpenShift). Images signées avec SBOM, exécution sans root, installation hors ligne possible. Versions semver, une version à support long par an.
* **Transport MCP (T10) :** HTTP « streamable » sans session, SDK officiel TypeScript ; SSE non supporté ; stdio pour le développement uniquement. Garde-fous : limite de requêtes par utilisateur, taille maximale de réponse, délai maximum par requête.
* **Partage des index (T9) :** l'indexeur publie des fichiers d'index immuables par vault dans un stockage objet compatible S3, avec un manifeste (version et empreinte). Chaque serveur télécharge, vérifie l'empreinte et bascule. Pas de disque réseau partagé. En Docker Compose mono-machine, un dossier local suffit.
* **Recherche (T5 à T8) :** racinisation française ; fusion par rang (RRF) entre texte et vecteurs, léger avantage au vault ciblé, une règle obligatoire pertinente n'est jamais écartée ; reclassement optionnel (bge-reranker-v2-m3) sur GPU. Découpage selon les titres, ~800 tokens (max ~1 500), ~10 % de chevauchement, jamais de coupe dans un bloc de code ou un tableau ; 5 extraits par recherche par défaut.
* **Synchronisation git (T14) :** copie locale en lecture seule ; webhook signé servant de simple réveil ; seuls les fichiers modifiés sont retraités ; version d'un extrait = identifiant de commit ; historique réécrit = réindexation complète.
* **Conversion (T15) :** mammoth (Word) et pdf.js (PDF) inclus ; Docling en service optionnel ; conversion de préférence au dépôt, dans un conteneur sans réseau avec limites de taille et de durée.

### 3.2 Outils MCP exposés (lecture seule)

| Outil | Rôle |
|---|---|
| `list_vaults` | vaults accessibles à l'utilisateur, avec leur chaîne d'héritage effective |
| `get_vault_context` | fiche `_CONTEXT.md` + en-tête calculé |
| `search` | recherche dans un vault et ses parents accessibles, extraits étiquetés |
| `read_document` | lecture d'un document (chemin contrôlé, pas de sortie du vault) |
| `list_documents` | liste des documents d'un vault |

### 3.3 API REST

* **V1 :** endpoints techniques uniquement : santé, métriques, webhook de réindexation, commande admin de réindexation (réservée aux admins).
* **V2 :** API REST de recherche en lecture seule, **miroir exact des outils MCP**, documentée en OpenAPI, pour les plateformes IA internes et chatbots qui ne parlent pas MCP.
* **Règle d'architecture :** MCP et REST sont deux façades minces sur le même moteur. Authentification, droits, niveaux et audit sont appliqués dans le moteur, jamais dans la façade.

### 3.4 Le Pattern d'Override (extension sans réécriture)

Le moteur se personnalise par **plugins composables** (modèle middleware), et non par héritage de classe : plusieurs plugins écrits par des équipes différentes peuvent cohabiter, et une mise à jour du cœur ne casse pas un plugin conforme. Chaque plugin implémente uniquement les hooks qui l'intéressent ; il appelle `next()` pour obtenir le comportement standard (équivalent de `super`). L'ordre des plugins est fixé dans la configuration ; `apiVersion` est vérifiée au démarrage.

Modes de combinaison : en chaîne avec `next()` (accès, rôles, héritage, métadonnées, découpage, classement, formatage) ; premier plugin qui prend en charge (`loadDocuments`, `convertDocument`, `embed`) ; tous (`detectPersonalData` — le plus strict l'emporte —, `onAuditEvent`, `onAlert`).

**Hooks publics (liste figée et versionnée) :**

| Domaine | Hook | Usage |
|---|---|---|
| Identité et accès | `resolveUserRoles(user)` | enrichir les rôles depuis l'annuaire (LDAP, Keycloak) |
| | `authenticateToken(token)` | valider un jeton OIDC ou personnel |
| | `resolveVaultAccess(userRoles, vaultId)` | règle d'accès spécifique |
| | `isClientAllowed(client, level)` | clients IA autorisés par niveau |
| Contenu | `computeInheritance(vaultId)` | chaîne de résolution des vaults hérités |
| | `loadDocuments(vault)` | connecteurs maison |
| | `convertDocument(file)` | conversion PDF, Word, autres formats |
| | `extractMetadata(doc)` | titre, catégorie `mandatory` / `default` |
| | `detectPersonalData(doc)` | détection de données personnelles |
| | `chunkDocument(doc)` | découpage en extraits |
| Recherche et rendu | `embed(texts)` | calcul des embeddings |
| | `rankResults(textHits, vectorHits)` | classement et fusion des résultats |
| | `formatContextChunk(chunk)` | formatage d'un extrait injecté dans le contexte du LLM |
| | `formatVaultContext(vault)` | en-tête de la fiche contexte |
| Exploitation | `onAuditEvent(event)` | export vers le SIEM |
| | `onAlert(alert)` | alertes RSSI / administrateurs |

**Invariants non surchargeables**, vérifiés par le cœur après les hooks :

1. Lecture seule : aucune écriture possible.
2. Un vault archivé reste inaccessible.
3. Le niveau de confidentialité et la liste des clients IA autorisés sont appliqués.
4. Les chemins de fichiers sont contrôlés (pas de sortie d'un vault).
5. L'audit est toujours émis.

Une extension peut élargir les droits par rôle, mais chaque accès qu'elle accorde alors que la règle par défaut l'aurait refusé est tracé à part dans l'audit.

### 3.5 Sécurité technique

* **Jetons (T11) :** le serveur est un serveur de ressources OAuth ; il vérifie la signature, l'émetteur et l'audience de chaque jeton. Les groupes sont lus dans le jeton (préfixe `vault-`, identifiant stable), avec repli sur l'annuaire et cache de 5 minutes. Vaults Critique : introspection du jeton à chaque requête.
* **Clients IA (T13) :** le nom annoncé par le client n'est jamais une preuve. Clients préenregistrés dans l'annuaire, enregistrement dynamique interdit. Élevé : accès conditionnel (postes gérés) et clients déployés par la DSI. Critique : seul le LLM interne, avec certificat client (mTLS), joignable uniquement depuis son réseau. **Seul le niveau Critique garantit techniquement le destinataire.**
* **Injection de consignes (T12) :** les extraits sont placés dans des balises infalsifiables ; tout texte imitant ces balises est neutralisé ; les instructions de connexion rappellent que les extraits sont de la documentation, pas des ordres. Chaque réponse fournit un texte balisé et un JSON équivalent. Les erreurs sont neutres.
* **Données personnelles et secrets (T16) :** règles intégrées avec clés de contrôle. Bloquant dès une occurrence : NIR, IBAN, carte bancaire, secrets (mots de passe, clés d'API, clés privées). Bloquant au-delà d'un seuil : emails, téléphones. Presidio en option pour les noms. Le même détecteur tourne à la demande de fusion, au dépôt d'un Word ou PDF et dans l'indexeur. Exceptions déclarées dans le fichier et validées par le RSSI.
* **Audit (T20) :** chaque événement est écrit dans un tampon local (ajout seul) avant l'envoi de la réponse, puis transmis au SIEM (syslog TLS, HTTP, sortie standard ou `onAuditEvent`). Chaîne d'empreintes entre événements. Tampon impossible à écrire : accès refusé en Élevé et Critique, maintenu avec alerte en Interne.
* **Stockage :** écriture réservée à l'indexeur, lecture aux serveurs ; disques chiffrés obligatoires pour Élevé et Critique.

### 3.6 Observabilité et tests

* **Observabilité (T19) :** OpenTelemetry (métriques, traces) et logs JSON, sans aucun contenu. Trois flux séparés : logs techniques, métriques et traces, audit. Alertes fournies : p95 > 200 ms, retard d'index > 15 min, pic de refus, service optionnel en panne. Un serveur n'est pas prêt tant que ses index ne sont pas chargés.
* **Tests (T21) :** chaque règle RG-01 à RG-22 a au moins un test portant son numéro. À chaque modification : matrice d'étanchéité (utilisateurs × vaults × outils) et attaques, test « aucune fuite », tests de contrat des extensions, résilience. La nuit : qualité de recherche (bon document dans les 5 premiers) et performance (100 req/s, p95 < 200 ms). Test d'intrusion tiers avant le premier grand client, puis chaque année.

### 3.7 Licence et modèle économique (T4)

Open core : le cœur est sous licence Apache 2.0 et contient toute la sécurité (SSO, droits, niveaux, audit). Offre payante : support, version à support long, fonctions grands comptes (adaptateur PostgreSQL, connecteurs, interface d'administration). Aucune dépendance GPL ou AGPL.

---

## 4. Guide d'Utilisation et d'Extension (Pour les Entreprises)

### 4.1 Installation Plug & Play

1. Récupérer l'image Docker (ou cloner le dépôt et construire l'image).
2. Renseigner les variables d'environnement : chemin de `vaults.config.json`, emplacement des dépôts de vaults, port, paramètres OIDC (émetteur, client), destination du SIEM.
3. Démarrer :

```sh
docker compose up -d
# avec le RAG de référence (TEI + bge-m3) :
docker compose --profile rag up -d
```

En développement de l'outil uniquement (vaults fictifs, mode stdio) :

```sh
npm install && npm run build
npm start
```

### 4.2 Comment surcharger une fonction (Pattern Override)

L'entreprise écrit un plugin à partir du modèle de projet fourni (structure, exemple, tests, CI), le publie comme paquet npm sur son registre privé, puis l'intègre dans une image dérivée signée, construite par sa CI (tests de contrat lancés à la construction). Le chargement depuis un dossier est réservé au développement. Exemple : exiger, en plus de l'appartenance au groupe, une habilitation projet en cours de validité dans le SI RH.

```ts
import { definePlugin } from '@contextvault/sdk';
import { habilitationValide } from './si-rh';

export default definePlugin({
  name: 'habilitation-rh',
  apiVersion: 1,
  hooks: {
    // Restreint l'accès : règle standard ET habilitation projet valide.
    async resolveVaultAccess(ctx, next) {
      if (!(await next())) return false;
      return habilitationValide(ctx.user, ctx.vault);
    },
  },
});
```

> L'exemple de la V4, qui donnait accès à tous les vaults au rôle `security-officer` par héritage de classe, est retiré : il recréait un super-admin contraire au cloisonnement (§2.6), et l'héritage empêchait de combiner plusieurs extensions. Un plugin s'exécute avec les droits du serveur : les plugins de sécurité sont relus et validés par le RSSI.

### 4.3 Mises à jour et compatibilité des extensions

* La liste des hooks est une **API publique versionnée (semver)**.
* Un hook déprécié reste disponible pendant **une version majeure entière**.
* Une **suite de tests de contrat** est livrée ; l'entreprise la lance sur ses extensions avant chaque mise à jour.

---

## 5. Critères de Validation et Sécurité

* **Étanchéité :** aucun utilisateur ni LLM ne peut accéder à un vault sans appartenir à son groupe ; les rôles ne proviennent jamais du client IA ; une erreur de configuration d'héritage ne peut pas ouvrir un accès (mode strict) ; aucune extension ne peut contourner les invariants du §3.4.
* **Imperméabilité conversationnelle :** aucune écriture exposée ; aucune conversation persistée ; l'audit ne contient pas le texte des requêtes.
* **Confidentialité :** un vault n'est servi qu'aux clients IA autorisés pour son niveau ; les vaults Élevé et Critique ne sont jamais envoyés à une API d'embeddings externe.
* **Traçabilité :** chaque accès accordé ou refusé est tracé avec les documents renvoyés ; conservation 6 mois à 1 an.
* **Révocation :** un retrait de groupe prend effet en 15 minutes au plus ; une désactivation de compte, à la requête suivante.
* **Performance :** temps de récupération du contexte ≤ 200 ms (p95) sur la volumétrie du §1.3, à 100 requêtes/s.
* **Fraîcheur :** une modification fusionnée est servie en quelques minutes ; une suppression est propagée en priorité.
* **Maintenabilité :** les mises à jour du cœur passent la suite de tests de contrat sans casser les extensions conformes.

---

## 6. Périmètre des versions

| | V1 | V2 |
|---|---|---|
| Interface | MCP (HTTP + OAuth), endpoints techniques | API REST de recherche (miroir MCP) |
| Sources | Markdown, texte, PDF, Word | Confluence, schémas SQL, Excel, PowerPoint |
| Recherche | FTS5 ; RAG optionnel par vault | — |
| Stockage | SQLite par vault | adaptateur PostgreSQL + pgvector |
| Sécurité | SSO, groupes, niveaux, audit, détection données personnelles | — |

---

## 7. Plan de livraison

Le détail (62 stories, 182 tâches de 1 à 3 points, export Jira) est dans le backlog : `backlog/backlog.html` et `backlog/backlog-jira.csv`. Sprints de deux semaines d'environ 20 points ; estimations à recalibrer avec l'équipe.

| Lot | Objectif | Sprints | Points |
|---|---|---|---|
| L0 Fondations | Squelette de bout en bout : un vault, une recherche, un utilisateur SSO | 1 à 3 | 49 |
| L1 MVP pilote | Pilote sur 2-3 projets réels Interne et Élevé : droits, héritage, indexation git, audit, détection des données personnelles | 4 à 8 | 88 |
| L2 V1 complète | Déploiement groupe : niveau Critique, RAG optionnel, plugins, Helm, observabilité, performance, test d'intrusion | 9 à 13 | 94 |
| V2 | API REST, importateurs Confluence et SQL, PostgreSQL | 14 à 15 | 26 |

Premiers tests à écrire (T21) : matrice d'étanchéité et test « aucune fuite », dès le lot L1.

