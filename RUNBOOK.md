# RUNBOOK

Short operational runbook for generic Linux VMs (Swedish cloud hosting).

## Backup schedule
- Daily backups, retention 30 days (rolling).
- Store dumps off-host (object storage or secondary disk).
- Script: `scripts/backup_postgres.sh` (usage in `scripts/README.md`).
- Cron example: `docs/CRON_BACKUP_EXAMPLE.md`.
- Restore drill checklist: `docs/RESTORE_DRILL_CHECKLIST.md`.

## Security verification
- Checklist: `docs/SECURITY_VERIFICATION_CHECKLIST.md`.

## Backup and restore commands (PostgreSQL)

### Dump database
```
export DATABASE_URL='postgresql://user:pass@host:5432/db'
pg_dump "$DATABASE_URL" --format=custom --file "backup_$(date +%F).dump"
```

### Restore into a fresh instance
```
export RESTORE_DATABASE_URL='postgresql://user:pass@host:5432/new_db'
createdb new_db   # or create the DB via psql/admin tools
pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" backup_YYYY-MM-DD.dump
```

### Verify restore
```
psql "$RESTORE_DATABASE_URL" -c "SELECT current_database();"
psql "$RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM handlers;"
psql "$RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM customers;"
```

Optional: start a backend instance pointing to the restored DB and call `/api/healthz`.

## Deployment steps
1) Pull the release/tag or copy build artifacts to the VM.
2) Backend: install deps and build.
   - `cd backend && npm ci && npm run build`
3) Ensure `.env.production` is in place with `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `LOGIN_*`.
4) Run migrations: `cd backend && npm run migrate`.
5) Restart process manager (pm2/systemd) and verify `/api/healthz`.
6) Frontend: build and deploy `dist/` to the static host.

## Rollback steps
1) Roll back to the previous build artifact or git tag and restart services.
2) If a migration caused issues, restore the database from the latest pre-deploy backup.
3) Verify `/api/healthz`, log in, and check a few core endpoints.

## Incident steps
1) Triage: assess impact, check `/api/healthz`, and review app/DB logs.
2) Mitigate: stop the deploy, block abusive traffic, or disable writes if needed.
3) Recover: roll back the release or restore DB from backup.
4) Communicate status and record a post-incident summary with root cause and actions.
