#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não definida (serviço API)."
  echo "No Railway: serviço API → Variables → Add Reference → Postgres → DATABASE_URL → Apply"
  exit 1
fi

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
fi

echo "Iniciando API..."
exec node dist/src/main.js
