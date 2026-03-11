#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-municipality-template}"
TENANT_CODE="${TENANT_ID:-${MUNICIPALITY_CODE:-${VITE_TENANT_ID:-${VITE_MUNICIPALITY_CODE:-}}}}"
DATABASE_URL_VALUE="${DATABASE_URL:-}"

if [[ -z "$DATABASE_URL_VALUE" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "$TENANT_CODE" ]]; then
  echo "TENANT_ID or MUNICIPALITY_CODE is required" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found in PATH" >&2
  exit 1
fi

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/var/backups/${APP_NAME}}"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_BASE_DIR}/${TENANT_CODE}}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ -z "$BACKUP_RETENTION_DAYS" || "$BACKUP_RETENTION_DAYS" =~ [^0-9] ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR" >&2
  exit 1
fi

timestamp="$(date +'%Y%m%d_%H%M%S')"
backup_file="${BACKUP_DIR}/${TENANT_CODE}_${timestamp}.dump"

pg_dump "$DATABASE_URL_VALUE" --format=custom --file "$backup_file"

if [[ "$BACKUP_RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -type f -name "${TENANT_CODE}_*.dump" -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
fi

echo "[$(date -Iseconds)] backup ok tenant=${TENANT_CODE} file=${backup_file} retention_days=${BACKUP_RETENTION_DAYS}"
