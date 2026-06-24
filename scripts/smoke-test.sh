#!/usr/bin/env bash
# Smoke test básico — requer API no ar (local ou produção).
# Uso: API_URL=https://siglm.up.railway.app ./scripts/smoke-test.sh

set -euo pipefail

API_URL="${API_URL:-http://localhost:3001/api}"
WEB_URL="${WEB_URL:-http://localhost:3000}"

pass=0
fail=0

check() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [ "$code" = "$expect" ]; then
    echo "✓ $name ($code)"
    pass=$((pass + 1))
  else
    echo "✗ $name — esperado $expect, obteve $code"
    fail=$((fail + 1))
  fi
}

echo "Smoke test SIGLM"
echo "API: $API_URL"
echo "Web: $WEB_URL"
echo "---"

check "Health API" "$API_URL/health"
check "Portal legislação" "$WEB_URL/legislacao"
check "Busca pública" "$WEB_URL/legislacao?q=ISS"
check "Admin login page" "$WEB_URL/admin/login"

echo "---"
echo "Passou: $pass | Falhou: $fail"
[ "$fail" -eq 0 ]
