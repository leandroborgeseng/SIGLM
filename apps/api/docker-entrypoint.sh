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
  npx prisma db seed
fi

echo "Iniciando API..."
exec node dist/src/main.js
