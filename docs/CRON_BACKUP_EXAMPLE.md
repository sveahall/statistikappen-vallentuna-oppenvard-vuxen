# Cron backup example (Linux VM)

Daily at 02:00 with log redirection:

```
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

0 2 * * * backup bash -lc 'set -a; source /srv/municipality-template/backend/.env.production; set +a; TENANT_ID=example /srv/municipality-template/scripts/backup_postgres.sh' >> /var/log/municipality-template/backup.log 2>&1
```

Recommended user and permissions:
- Run as a dedicated user (e.g. `backup` or the app service account).
- Ensure the user can read the env file and write to `/var/backups/municipality-template`.
- Suggested permissions: env file `600`, backup dir `750` (owned by the backup user).

## Multiple tenants on the same VM

Stagger runs to avoid overlapping jobs:

```
0 2 * * * backup bash -lc 'set -a; source /srv/tenant-a/backend/.env.production; set +a; TENANT_ID=tenant-a BACKUP_BASE_DIR=/var/backups/municipality-template /srv/municipality-template/scripts/backup_postgres.sh' >> /var/log/municipality-template/backup-tenant-a.log 2>&1
15 2 * * * backup bash -lc 'set -a; source /srv/tenant-b/backend/.env.production; set +a; TENANT_ID=tenant-b BACKUP_BASE_DIR=/var/backups/municipality-template /srv/municipality-template/scripts/backup_postgres.sh' >> /var/log/municipality-template/backup-tenant-b.log 2>&1
```

Make sure `pg_dump` is installed and available in the cron PATH.
