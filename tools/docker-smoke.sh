#!/bin/sh
# Vérifie l'image Docker (BC-03.1, BC-03.4) :
#   - taille < 300 Mo, utilisateur non root ;
#   - le serveur démarre et répond SANS aucun accès réseau (--network none) ;
#   - hors développement, les transports non encore sécurisés sont refusés.
#
# Usage : tools/docker-smoke.sh [image]   (défaut : contextvault:dev)
set -eu

IMAGE="${1:-contextvault:dev}"
MAX_BYTES=$((300 * 1000 * 1000))
NAME="contextvault-smoke-$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "ÉCHEC : $*" >&2; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

size=$(docker image inspect "$IMAGE" --format '{{.Size}}')
[ "$size" -lt "$MAX_BYTES" ] || fail "image de $((size / 1000000)) Mo (max 300 Mo)"
echo "OK  taille : $((size / 1000000)) Mo"

uid=$(docker run --rm --network none "$IMAGE" id -u)
[ "$uid" != "0" ] || fail "l'image s'exécute en root"
echo "OK  utilisateur non root (uid $uid)"

docker run -d --name "$NAME" --network none --read-only \
  -e CONTEXTVAULT_ENV=development \
  -v "$ROOT/dev/vaults.config.json:/etc/contextvault/vaults.config.json:ro" \
  "$IMAGE" >/dev/null

ready=""
for _ in $(seq 1 20); do
  if ready=$(docker exec "$NAME" wget -qO- http://127.0.0.1:8080/readyz 2>/dev/null); then break; fi
  sleep 0.5
done
echo "$ready" | grep -q '"status":"ready"' || { docker logs "$NAME" >&2; fail "serveur non prêt sans réseau"; }
echo "OK  serveur prêt sans accès réseau : $ready"

init=$(docker exec "$NAME" wget -qO- \
  --header 'content-type: application/json' \
  --header 'accept: application/json, text/event-stream' \
  --post-data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' \
  http://127.0.0.1:8080/mcp)
echo "$init" | grep -q '"name":"contextvault"' || fail "réponse MCP inattendue : $init"
echo "OK  MCP initialize répond"

if docker run --rm --network none -v "$ROOT/dev/vaults.config.json:/etc/contextvault/vaults.config.json:ro" \
  "$IMAGE" >/dev/null 2>&1; then
  fail "le transport HTTP démarre hors développement"
fi
echo "OK  HTTP sans authentification refusé hors développement"

if docker run --rm --network none -v "$ROOT/dev/vaults.config.json:/etc/contextvault/vaults.config.json:ro" \
  "$IMAGE" node packages/server/dist/bin.js --stdio </dev/null >/dev/null 2>&1; then
  fail "le mode stdio démarre hors développement"
fi
echo "OK  stdio refusé hors développement"
