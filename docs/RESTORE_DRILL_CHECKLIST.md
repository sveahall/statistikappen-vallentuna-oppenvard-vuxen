# Restore Drill Checklist

Frequency: quarterly (at least once per quarter).

## Preparation
- Pick a recent backup within the retention window (record filename and timestamp).
- Provision a fresh staging database (empty instance).
- Confirm access to staging app environment and credentials.

## Restore steps
1) Restore the backup into staging:
   - `pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" backup_YYYY-MM-DD.dump`
2) Point a staging backend at the restored database.
3) Run migrations if required by the current release.

## Verification steps
- Log in with a known test admin account.
- Create a new customer record.
- Create a case/shift for the new customer.
- Open the statistics page and verify it loads.
- Run an export and verify the file is generated.

## Evidence to record
- Drill date/time (UTC or local time, be consistent).
- Backup file used and its creation time.
- Restore duration (start/end timestamps).
- Result (pass/fail) and notes on any issues.

## Rollback and cleanup
- Remove staging data if it contains sensitive information not needed.
- Drop the staging database or wipe it for the next drill.
- Revert staging app settings to default.
- Store the drill record in the ops log or ticket system.
