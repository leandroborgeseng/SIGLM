#!/usr/bin/env bash
# Verifica integridade do repositório restic (rodar semanalmente).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_env "$SCRIPT_DIR/restic.env"
require_restic

export RESTIC_REPOSITORY RESTIC_PASSWORD

echo "==> restic check ($(timestamp_utc))"
restic check
echo "==> OK"
