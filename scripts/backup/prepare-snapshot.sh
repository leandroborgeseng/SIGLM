#!/usr/bin/env bash
# Monta snapshot consistente: dump Postgres + cópia de uploads + manifest.
# Uso: scripts/backup/prepare-snapshot.sh [destino]
# Saída: diretório pronto para `restic backup`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_env "$SCRIPT_DIR/restic.env"
require_docker

DEST="${1:-$BACKUP_STAGING}"
TS="$(snapshot_id)"
SNAP_DIR="$DEST/$TS"

mkdir -p "$SNAP_DIR/postgres" "$SNAP_DIR/uploads"

echo "==> SIGLM backup snapshot $TS"
echo "    Destino: $SNAP_DIR"

cd "$SIGLM_ROOT"

if ! compose ps --status running "$POSTGRES_SERVICE" 2>/dev/null | grep -q "$POSTGRES_SERVICE"; then
  echo "ERRO: serviço postgres não está rodando." >&2
  echo "Execute a partir do servidor onde o compose está ativo." >&2
  exit 1
fi

DUMP_FILE="$SNAP_DIR/postgres/${POSTGRES_DB}-${TS}.sql.gz"
echo "==> Dump PostgreSQL → $DUMP_FILE"
compose exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip -9 > "$DUMP_FILE"

if [[ ! -s "$DUMP_FILE" ]]; then
  echo "ERRO: dump PostgreSQL vazio ou falhou." >&2
  exit 1
fi

echo "==> Exportando uploads (PDFs, anexos)..."
if compose ps --status running "$API_SERVICE" 2>/dev/null | grep -q "$API_SERVICE"; then
  compose exec -T "$API_SERVICE" \
    tar -C /app/apps/api -cf - uploads 2>/dev/null \
    | tar -xf - -C "$SNAP_DIR"
else
  echo "AVISO: api offline — tentando volume Docker diretamente..."
  PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$SIGLM_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')}"
  VOLUME="${PROJECT}_api_uploads"
  if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    docker run --rm \
      -v "${VOLUME}:/src:ro" \
      -v "$SNAP_DIR/uploads:/dst" \
      alpine:3.20 \
      sh -c 'cp -a /src/. /dst/ 2>/dev/null || true'
  else
    echo "AVISO: volume $VOLUME não encontrado; uploads omitidos." >&2
  fi
fi

UPLOAD_COUNT="$(find "$SNAP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"

MANIFEST="$SNAP_DIR/manifest.json"
cat > "$MANIFEST" <<EOF
{
  "app": "siglm",
  "version": "1",
  "created_at": "$(timestamp_utc)",
  "snapshot_id": "$TS",
  "compose_file": "$COMPOSE_FILE",
  "postgres": {
    "user": "$POSTGRES_USER",
    "database": "$POSTGRES_DB",
    "dump_file": "postgres/$(basename "$DUMP_FILE")",
    "size_bytes": $(wc -c < "$DUMP_FILE" | tr -d ' ')
  },
  "uploads": {
    "path": "uploads/",
    "file_count": $UPLOAD_COUNT
  },
  "restore_hint": "scripts/backup/restic-restore.sh $TS"
}
EOF

# Link latest para automação
ln -sfn "$SNAP_DIR" "$BACKUP_STAGING/latest"

echo "==> Snapshot pronto"
echo "    Manifest: $MANIFEST"
echo "    Dump:     $(du -h "$DUMP_FILE" | cut -f1)"
echo "    Uploads:  $UPLOAD_COUNT arquivo(s)"
echo "$SNAP_DIR"
