# Scripts

## backup_postgres.sh

Minimal backup helper for PostgreSQL using `pg_dump` (custom format).

### Required environment variables
- `DATABASE_URL` (PostgreSQL connection string)
- `TENANT_ID` or `MUNICIPALITY_CODE` (used in the backup filename)

### Optional environment variables
- `APP_NAME` (default: `municipality-template`)
- `BACKUP_BASE_DIR` (default: `/var/backups/$APP_NAME`)
- `BACKUP_DIR` (overrides full backup path)
- `BACKUP_RETENTION_DAYS` (default: `30`)

### Usage
```
export DATABASE_URL='postgresql://user:pass@host:5432/db'
export TENANT_ID='example'
./scripts/backup_postgres.sh
```

Notes:
- Requires `pg_dump` in `PATH`.
- The script creates the backup directory if missing and applies a `umask 077`.
- A single log line is printed to stdout per run.
