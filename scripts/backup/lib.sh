#!/usr/bin/env bash
# Funções compartilhadas — backup SIGLM / Restic

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

load_env() {
  local env_file="${1:-$SCRIPT_DIR/restic.env}"
  if [[ ! -f "$env_file" ]]; then
    echo "ERRO: arquivo de configuração não encontrado: $env_file" >&2
    echo "Copie restic.env.example → restic.env e preencha." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a
  source "$env_file"
  set +a

  : "${RESTIC_REPOSITORY:?Defina RESTIC_REPOSITORY em restic.env}"
  : "${RESTIC_PASSWORD:?Defina RESTIC_PASSWORD em restic.env}"
  : "${SIGLM_ROOT:?Defina SIGLM_ROOT (caminho do repo no servidor)}"
  : "${BACKUP_STAGING:?Defina BACKUP_STAGING}"

  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.coolify.yml}"
  POSTGRES_USER="${POSTGRES_USER:-siglm}"
  POSTGRES_DB="${POSTGRES_DB:-siglm}"
  POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
  API_SERVICE="${API_SERVICE:-api}"
  RESTIC_TAG="${RESTIC_TAG:-siglm}"
}

compose() {
  local args=(-f "$SIGLM_ROOT/$COMPOSE_FILE")
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    args+=(-p "$COMPOSE_PROJECT_NAME")
  fi
  docker compose "${args[@]}" "$@"
}

require_restic() {
  if ! command -v restic >/dev/null 2>&1; then
    echo "ERRO: restic não encontrado. Instale: https://restic.net/" >&2
    exit 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERRO: docker não encontrado." >&2
    exit 1
  fi
}

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

snapshot_id() {
  date -u +"%Y%m%d-%H%M%S"
}

notify() {
  local status="$1"
  local message="$2"
  if [[ -n "${BACKUP_NOTIFY_CMD:-}" ]]; then
    eval "$BACKUP_NOTIFY_CMD" "$status" "$message" || true
  fi
}
