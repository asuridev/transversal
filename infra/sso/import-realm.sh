#!/usr/bin/env bash
# Importa infra/sso/realm/backoffice-realm.json en un RH-SSO 7.6 ya arrancado
# (podman-compose up), vía la REST admin API. Uso:
#   bash infra/sso/import-realm.sh [http://localhost:8080] [admin] [admin]
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
ADMIN_USER="${2:-admin}"
ADMIN_PASSWORD="${3:-admin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TOKEN=$(curl -sf -X POST "$BASE_URL/auth/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASSWORD" -d "grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "No se pudo obtener token de admin — ¿está RH-SSO arriba en $BASE_URL?" >&2
  exit 1
fi

# Import idempotente: POST /admin/realms solo CREA (409 si ya existe, sin
# aplicar cambios). Para que re-ejecutar aplique siempre la config vigente
# (incl. redirectUris del logout de reino), borramos el reino si ya existe
# antes de recrearlo. El JSON trae clients/users anidados, así que
# delete-then-create reemplaza todo en bloque (un PUT de reino no lo haría).
EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" "$BASE_URL/auth/admin/realms/backoffice")

if [ "$EXISTS" = "200" ]; then
  echo "realm 'backoffice' ya existe — se elimina para reimportar limpio"
  curl -sf -X DELETE "$BASE_URL/auth/admin/realms/backoffice" \
    -H "Authorization: Bearer $TOKEN"
fi

STATUS=$(curl -s -o /dev/stderr -w "%{http_code}" -X POST "$BASE_URL/auth/admin/realms" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary "@$SCRIPT_DIR/realm/backoffice-realm.json")

echo "import status: $STATUS"
