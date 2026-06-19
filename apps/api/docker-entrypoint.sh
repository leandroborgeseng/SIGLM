#!/bin/sh
set -e

echo "Aplicando migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Executando seed..."
  npx prisma db seed
fi

echo "Iniciando API..."
exec node dist/src/main.js
