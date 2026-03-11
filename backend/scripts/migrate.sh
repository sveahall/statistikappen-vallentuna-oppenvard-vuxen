#!/usr/bin/env bash
set -euo pipefail
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true

# 1) Create base schema (tables) if missing
psql "$DATABASE_URL" -f "$(dirname "$0")/../create_base_schema.sql"

# 2) Add/align optional columns (idempotent)
psql "$DATABASE_URL" -f "$(dirname "$0")/../../add_refresh_token_column.sql"
psql "$DATABASE_URL" -f "$(dirname "$0")/../../add_login_lockout_columns.sql"

# 3) Audit log table and cleanup function (requires handlers)
psql "$DATABASE_URL" -f "$(dirname "$0")/../../create_audit_log_table.sql"

# 4) Ensure customers.is_protected exists
psql "$DATABASE_URL" -f "$(dirname "$0")/../../add_is_protected_column.sql"

# 5) Update invites table, view and indexes (requires invites & handlers)
psql "$DATABASE_URL" -f "$(dirname "$0")/../../fix_invites_table.sql"

# 6) Create performance indexes
psql "$DATABASE_URL" -f "$(dirname "$0")/../../create_indexes.sql"
echo "Migration OK"
