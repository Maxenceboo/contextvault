# syntax=docker/dockerfile:1
#
# Image unique ContextVault (T3) : serveur MCP par défaut, indexeur avec
#   docker run … node packages/indexer/dist/bin.js
#
# Installation hors ligne (BC-03.4) : NODE_IMAGE et NPM_REGISTRY pointent vers
# les registres internes, voir docs/installation-hors-ligne.md.

ARG NODE_IMAGE=node:22-alpine

# --- Compilation -------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/indexer/package.json packages/indexer/
# Certificat d'une autorité interne (registre npm d'entreprise, proxy) :
#   docker build --secret id=npm_ca,src=ca-interne.pem …
RUN --mount=type=secret,id=npm_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --ignore-scripts
COPY packages packages
RUN npx tsc -b packages/server packages/indexer \
 && find packages -path '*/dist/*' \( -name '*.test.*' -o -name 'testing.*' \) -delete

# --- Dépendances de production ----------------------------------------------
FROM ${NODE_IMAGE} AS deps
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/indexer/package.json packages/indexer/
RUN --mount=type=secret,id=npm_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

# --- Image d'exécution -------------------------------------------------------
FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="ContextVault" \
      org.opencontainers.image.description="Serveur MCP de banque de contextes multi-vaults" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/Maxenceboo/contextvault"

ENV NODE_ENV=production \
    CONTEXTVAULT_ENV=production \
    CONTEXTVAULT_HOST=0.0.0.0 \
    CONTEXTVAULT_PORT=8080 \
    CONTEXTVAULT_CONFIG=/etc/contextvault/vaults.config.json \
    CONTEXTVAULT_INDEX_DIR=/var/lib/contextvault/index

WORKDIR /app
# npm et corepack ne servent pas à l'exécution : moins de taille, moins de surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && mkdir -p /etc/contextvault /var/lib/contextvault/index \
 # Compatible OpenShift : UID arbitraire, groupe 0.
 && chown -R 1000:0 /var/lib/contextvault \
 && chmod -R g=u /var/lib/contextvault

COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json ./
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/indexer/package.json packages/indexer/
COPY --from=build /app/packages/indexer/dist packages/indexer/dist

# Utilisateur non root (uid 1000 = « node » dans les images officielles).
USER 1000:0
EXPOSE 8080
CMD ["node", "packages/server/dist/bin.js"]
