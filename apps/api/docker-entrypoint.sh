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

echo "Aplicando migrations..."
npx prisma migrate deploy

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
exec npm start
