# Deployment

## Environment
- Backend: `DATABASE_URL`, `JWT_SECRET`, `BCRYPT_ROUNDS`, `PORT`, `CORS_ORIGIN`, `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX`, `LOGIN_IP_RATE_LIMIT_WINDOW_MS`, `LOGIN_IP_RATE_LIMIT_MAX`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`
- Frontend: `VITE_API_URL`, `VITE_TENANT_ID` (alt. `VITE_MUNICIPALITY_CODE`), `VITE_MUNICIPALITY_NAME`, `VITE_UI_BRAND_NAME`, `VITE_SUPPORT_EMAIL`

> Varje kommuninstallation måste använda sin egen `DATABASE_URL` (egen databas).

## Migration

Invites/reset hanteras i Node-koden med bcrypt. Ingen pgcrypto behövs. Följ `docs/ADMIN_MANUAL.md` för reset-flöde och se `BCRYPT_ROUNDS` i `.env`.

## Start
```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm run preview
```

## Healthcheck and CORS test
```bash
curl -i http://localhost:4000/api/healthz
curl -i -H "Origin: http://localhost:5173" -X OPTIONS http://localhost:4000/api/handlers
```

## Common issues
- **401/403**: Check JWT token and user role.
- **CORS mismatch**: Ensure `CORS_ORIGIN` matches the request origin.
- **429**: Too many login/invite attempts or konto låst; vänta innan nytt försök.

## Retention

- Audit logs are retained for 5 years and then purged by `cleanup_old_audit_logs()` (see `create_audit_log_table.sql`).
- Schedule cleanup daily/weekly via cron or pg_cron, or call the admin endpoint `/api/audit/cleanup` from a server job.
- Operational logs (e.g. Nginx) typically 6–12 months (follow site policy).
- Business data (customers, cases, shifts, efforts, handlers) is not hard-deleted. Entities are deactivated; customer initials are anonymized when deactivated. See `docs/RETENTION_POLICY.md` for details.

## ENV-exempel

Kontrollera att `BCRYPT_ROUNDS` finns i `.env.example` och `.env.local`. Lägg till vid behov utan att ta bort andra variabler.
