# Dataretention och gallring

Denna policy sammanfattar hur systemets data gallras och bevaras.

## Översikt (matris)

- Auditloggar (granskningslogg):
  - Retention: 5 år.
  - Gallring: `cleanup_old_audit_logs()` tar bort loggar äldre än 5 år (se `create_audit_log_table.sql`).
  - Schemalägg: kör funktionen dagligen/veckovis via cron/pg_cron eller via API `/api/audit/cleanup` i en schemalagd job.

- Lösenordsåterställning (password_resets):
  - Retention: 1 timme (tokens går ut efter 1h) och markeras använda vid nyttjande.
  - Gallring: rensas automatiskt i applikationsflödet; rekommenderas periodisk DB‑rensning av förfallna.

- Inbjudningar (invites):
  - Retention: 7 dagar för pending‑invites.
  - Gallring: förfallna och använda invites kan rensas periodiskt.

- Webserver-/accessloggar (Nginx m.m.):
  - Rekommendation: 6–12 månader (styrs av driftpolicy/lagkrav). Undvik att spara onödig PII.

- Verksamhetsdata (customers, cases, shifts, efforts, handlers):
  - Princip: ingen hård radering. Avaktivera i stället.
  - Kunder: vid avaktivering anonymiseras initialer permanent (GDPR) men övriga fält behålls för statistik.
  - Behandlare/insatser: avaktiveras; referenser i insatsen/tider bevaras.
  - Statistik: visas normalt på aktiva enheter; “Inkludera inaktiva” kan aktiveras vid behov.

## Schemaläggning av audit‑gallring

Exempel med cron (kör dagligen kl 02:30):

```
# Kör i serverns miljö, använd rätt DATABASE_URL i .env
30 2 * * * psql "$DATABASE_URL" -c "SELECT cleanup_old_audit_logs();" >/var/log/municipality_audit_cleanup.log 2>&1
```

Alternativt via pg_cron i PostgreSQL:

```
SELECT cron.schedule('audit-cleanup-daily', '30 2 * * *', $$SELECT cleanup_old_audit_logs();$$);
```

Eller via API (om ni föredrar HTTP‑styrd körning):

- Skapa ett serverjobb som gör `POST https://<host>/api/audit/cleanup` med en admin‑token.

## Noter

- Denna policy kompletterar kommunens dokumenthanteringsplan. Verksamhetsdata bevaras enligt arkivkrav; gallring gäller främst tekniska loggar och kortlivade tokens.
- Om retention‑tider behöver ändras uppdateras SQL‑funktionen och crontab/pg_cron‑jobben.
