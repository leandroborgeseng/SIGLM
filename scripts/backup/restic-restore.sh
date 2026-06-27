#!/usr/bin/env bash
# Restaura backup SIGLM a partir do Restic.
#
# Uso:
#   restic-restore.sh list                    # lista snapshots
#   restic-restore.sh latest [dir]            # restaura último snapshot
#   restic-restore.sh snapshot:ID [dir]       # restaura snapshot específico
#   restic-restore.sh apply [dir]             # aplica dump + uploads no compose
#
# ATENÇÃO: `apply` sobrescreve banco e uploads em produção. Pare a API antes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_env "$SCRIPT_DIR/restic.env"
require_restic
require_docker

export RESTIC_REPOSITORY RESTIC_PASSWORD

CMD="${1:-list}"
TARGET="${2:-/var/lib/siglm-backup/restore}"

case "$CMD" in
  list)
    restic snapshots --tag "${RESTIC_TAG:-siglm}"
    ;;
  latest)
    echo "==> Restaurando último snapshot → $TARGET"
    mkdir -p "$TARGET"
    restic restore latest --tag "${RESTIC_TAG:-siglm}" --target "$TARGET"
    echo "Restaurado em: $TARGET"
    find "$TARGET" -name manifest.json 2>/dev/null | head -3
    ;;
  snapshot:*)
    SNAP_ID="${CMD#snapshot:}"
    echo "==> Restaurando snapshot $SNAP_ID → $TARGET"
    mkdir -p "$TARGET"
    restic restore "$SNAP_ID" --target "$TARGET"
    ;;
  apply)
    RESTORE_ROOT="$TARGET"
    if [[ ! -f "$RESTORE_ROOT/manifest.json" ]]; then
      # restic restore cria subpastas com timestamp
      MANIFEST="$(find "$RESTORE_ROOT" -name manifest.json | head -1)"
      if [[ -z "$MANIFEST" ]]; then
        echo "ERRO: manifest.json não encontrado em $RESTORE_ROOT" >&2
        echo "Execute antes: restic-restore.sh latest $RESTORE_ROOT" >&2
        exit 1
      fi
      RESTORE_ROOT="$(dirname "$MANIFEST")"
    fi

    echo "AVISO: isto irá SOBRESCREVER o banco $POSTGRES_DB e uploads."
    read -r -p "Digite RESTAURAR para continuar: " confirm
    [[ "$confirm" == "RESTAURAR" ]] || exit 1

    cd "$SIGLM_ROOT"
    DUMP="$(find "$RESTORE_ROOT/postgres" -name '*.sql.gz' | head -1)"
    if [[ -z "$DUMP" ]]; then
      echo "ERRO: dump .sql.gz não encontrado." >&2
      exit 1
    fi

    echo "==> Recriando banco $POSTGRES_DB..."
    compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${POSTGRES_DB};
CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};
SQL

    echo "==> Restaurando PostgreSQL de $DUMP"
    gunzip -c "$DUMP" | compose exec -T "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

    if [[ -d "$RESTORE_ROOT/uploads" ]]; then
      echo "==> Restaurando uploads..."
      compose exec -T "$API_SERVICE" rm -rf /app/apps/api/uploads.bak 2>/dev/null || true
      compose exec -T "$API_SERVICE" mv /app/apps/api/uploads /app/apps/api/uploads.bak 2>/dev/null || true
      tar -C "$RESTORE_ROOT" -cf - uploads | compose exec -T "$API_SERVICE" tar -C /app/apps/api -xf -
    fi

    echo "==> Reinicie api e web: docker compose restart api web"
    echo "==> Restauração aplicada."
    ;;
  *)
    echo "Uso: $0 {list|latest [dir]|snapshot:ID [dir]|apply [dir]}" >&2
    exit 1
    ;;
esac
