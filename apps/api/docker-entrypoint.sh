#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não definida (serviço API)."
  echo "No compose Coolify a URL é montada automaticamente a partir de POSTGRES_*."
  exit 1
fi

case "$JWT_SECRET" in
  ''|'change_me_jwt_secret'|'Defina JWT_SECRET'|'Defina JWT_SECRET'*)
    echo "AVISO: JWT_SECRET não configurado — defina no Coolify (openssl rand -base64 48)."
    ;;
esac

case "$POSTGRES_PASSWORD" in
  ''|'siglm_change_me'|'Defina POSTGRES_PASSWORD'|'Defina POSTGRES_PASSWORD'*)
    echo "AVISO: POSTGRES_PASSWORD fraca ou placeholder — use senha real no Coolify."
    ;;
esac

# Prisma CLI: workspace root ou PATH (produção precisa de `prisma` em dependencies).
PRISMA_BIN=""
for candidate in \
  ../../node_modules/.bin/prisma \
  ./node_modules/.bin/prisma \
  /app/node_modules/.bin/prisma
do
  if [ -x "$candidate" ]; then
    PRISMA_BIN="$candidate"
    break
  fi
done
if [ -z "$PRISMA_BIN" ]; then
  PRISMA_BIN="$(command -v prisma 2>/dev/null || true)"
fi
if [ -z "$PRISMA_BIN" ] || [ ! -x "$PRISMA_BIN" ]; then
  echo "ERRO: CLI prisma não encontrado na imagem. Verifique apps/api/Dockerfile e dependencies."
  exit 1
fi

echo "Aplicando migrations (prisma migrate deploy)..."
i=0
RESOLVED_FAILED_MIGRATION=0
until migrate_out="$("$PRISMA_BIN" migrate deploy 2>&1)"; do
  ec=$?
  printf '%s\n' "$migrate_out"
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "ERRO: prisma migrate deploy falhou após 30 tentativas."
    exit 1
  fi
  # P3009: migration marcada como failed no banco. A 20260727230000 falhou no UPDATE
  # (setweight/CASE) após criar enum/colunas — marcar rolled-back e reaplicar SQL corrigido.
  if [ "$RESOLVED_FAILED_MIGRATION" -eq 0 ] \
    && printf '%s' "$migrate_out" | grep -q 'P3009' \
    && printf '%s' "$migrate_out" | grep -q '20260727230000_identified_import_text'; then
    echo "Detectado P3009 em 20260727230000_identified_import_text — resolve --rolled-back e reaplica..."
    "$PRISMA_BIN" migrate resolve --rolled-back 20260727230000_identified_import_text || true
    RESOLVED_FAILED_MIGRATION=1
    sleep 1
    continue
  fi
  echo "Banco ainda não pronto ou migrate falhou; nova tentativa em 2s ($i/30)..."
  sleep 2
done
printf '%s\n' "$migrate_out"
echo "Migrations aplicadas."

if [ "$RUN_SEED" = "true" ]; then
  echo "Executando seed..."
  if [ -f dist/prisma/seed.js ]; then
    node dist/prisma/seed.js
  else
    echo "ERRO: dist/prisma/seed.js não encontrado. Rode o build da API."
    exit 1
  fi
else
  node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count()
  .then((n) => {
    if (n === 0) {
      console.warn('');
      console.warn('AVISO: banco sem usuários — login admin vai falhar.');
      console.warn('Defina RUN_SEED=true no Coolify e redeploy (depois RUN_SEED=false).');
      console.warn('');
    } else {
      console.log('Usuários no banco:', n);
    }
  })
  .catch((e) => {
    console.error('ERRO: não foi possível consultar o banco:', e.message);
    console.error('POSTGRES_PASSWORD no Coolify deve ser a MESMA da 1ª subida do postgres.');
    process.exit(1);
  })
  .finally(() => p.\$disconnect());
"
fi

echo "Iniciando API..."
exec node dist/src/main
