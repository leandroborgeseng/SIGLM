#!/usr/bin/env bash
# Backup completo SIGLM → Restic.
# 1) Monta snapshot (Postgres + uploads)
# 2) restic backup
# 3) restic forget + prune (retenção)
#
# Uso: scripts/backup/restic-backup.sh
# Cron: 0 3 * * * /caminho/SIGLM/scripts/backup/restic-backup.sh >> /var/log/siglm-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_env "$SCRIPT_DIR/restic.env"
require_restic
require_docker

export RESTIC_REPOSITORY RESTIC_PASSWORD
[[ -n "${AWS_ACCESS_KEY_ID:-}" ]] && export AWS_ACCESS_KEY_ID
[[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] && export AWS_SECRET_ACCESS_KEY
[[ -n "${AWS_DEFAULT_REGION:-}" ]] && export AWS_DEFAULT_REGION

TAG_DATE="$(date -u +%Y-%m-%d)"
SNAP_DIR=""
STATUS=0

cleanup() {
  if [[ -n "$SNAP_DIR" && -d "$SNAP_DIR" && "${BACKUP_KEEP_STAGING:-false}" != "true" ]]; then
    echo "==> Limpando staging: $SNAP_DIR"
    rm -rf "$SNAP_DIR"
  fi
  if [[ $STATUS -ne 0 ]]; then
    notify fail "Backup SIGLM falhou"
  fi
}
trap cleanup EXIT

echo "========================================"
echo " SIGLM Restic backup — $(timestamp_utc)"
echo "========================================"

# Inicializa repositório se não existir
if ! restic snapshots >/dev/null 2>&1; then
  echo "==> Inicializando repositório restic..."
  restic init
fi

SNAP_DIR="$("$SCRIPT_DIR/prepare-snapshot.sh" "$BACKUP_STAGING")"
SNAP_ID="$(basename "$SNAP_DIR")"

echo "==> Enviando para restic: $RESTIC_REPOSITORY"
restic backup "$SNAP_DIR" \
  --tag "$RESTIC_TAG" \
  --tag "date:$TAG_DATE" \
  --tag "snapshot:$SNAP_ID" \
  --host "${RESTIC_HOSTNAME:-$(hostname -s)}"

echo "==> Aplicando política de retenção..."
restic forget \
  --tag "$RESTIC_TAG" \
  --keep-daily "${RESTIC_KEEP_DAILY:-30}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-12}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" \
  --keep-yearly "${RESTIC_KEEP_YEARLY:-2}" \
  --prune

echo "==> Snapshots disponíveis:"
restic snapshots --tag "$RESTIC_TAG" | tail -5

notify ok "Backup SIGLM $SNAP_ID concluído"
echo "==> Backup concluído com sucesso."
