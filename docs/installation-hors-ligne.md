# Installation hors ligne (BC-03.4)

ContextVault s'installe sans accès Internet à partir d'un registre d'images interne. À l'exécution, le serveur et l'indexeur n'ont besoin d'aucun accès Internet : ils ne joignent que les services de l'entreprise (annuaire, forge git, stockage, SIEM).

La procédure est vérifiée en CI par `tools/docker-smoke.sh`, qui démarre l'image avec `--network none` et interroge le serveur MCP.

## Option A : transférer l'image construite

Sur une machine connectée :

```sh
docker build -t contextvault:<version> .
docker save contextvault:<version> | gzip > contextvault-<version>.tar.gz
sha256sum contextvault-<version>.tar.gz > contextvault-<version>.tar.gz.sha256
```

Transférer l'archive et son empreinte, puis sur le réseau isolé :

```sh
sha256sum -c contextvault-<version>.tar.gz.sha256
docker load < contextvault-<version>.tar.gz
docker tag contextvault:<version> registre.interne.example/contextvault:<version>
docker push registre.interne.example/contextvault:<version>
```

## Option B : construire depuis les registres internes

Quand le registre d'images et le miroir npm de l'entreprise sont joignables depuis la machine de construction :

```sh
docker build \
  --build-arg NODE_IMAGE=registre.interne.example/library/node:22-alpine \
  --build-arg NPM_REGISTRY=https://npm.interne.example/ \
  --secret id=npm_ca,src=/chemin/vers/ca-interne.pem \
  -t registre.interne.example/contextvault:<version> .
```

- `NODE_IMAGE` : image Node 22 Alpine recopiée dans le registre interne.
- `NPM_REGISTRY` : miroir npm interne (Nexus, Artifactory, Verdaccio…).
- `npm_ca` (facultatif) : certificat de l'autorité interne si le miroir n'utilise pas une autorité publique. Il sert uniquement à la construction et ne reste pas dans l'image.

## Vérifier l'installation

```sh
tools/docker-smoke.sh registre.interne.example/contextvault:<version>
```

Le script contrôle la taille (< 300 Mo), l'utilisateur non root, le démarrage sans réseau et le refus des transports réservés au développement.

## Lancer les processus

L'image contient le serveur (commande par défaut) et l'indexeur :

```sh
docker run … registre.interne.example/contextvault:<version>                                   # serveur MCP
docker run … registre.interne.example/contextvault:<version> node packages/indexer/dist/bin.js # indexeur
```

Variables : `CONTEXTVAULT_CONFIG` (défaut `/etc/contextvault/vaults.config.json`), `CONTEXTVAULT_INDEX_DIR` (défaut `/var/lib/contextvault/index`), `CONTEXTVAULT_HOST`, `CONTEXTVAULT_PORT` (défaut `8080`), `CONTEXTVAULT_LOG_LEVEL`, `CONTEXTVAULT_ENV`.

Le serveur monte le dossier des index en lecture seule (`:ro`) ; seul l'indexeur l'a en écriture. L'image fonctionne avec `--read-only` et un UID arbitraire du groupe 0 (OpenShift).

Tant que l'authentification OIDC (BC-10) n'est pas livrée, le serveur refuse de démarrer hors `CONTEXTVAULT_ENV=development`.
