# Deploy Checklista och Snabbstart

Denna guide beskriver hur du bygger, packar och kör systemet i produktion med PM2 samt sätter upp Nginx som reverse proxy med HTTPS och HSTS.

## Miljövariabler (backend)

Kopiera `.env.example` till `.env.production` och fyll i:

- `DATABASE_URL=postgresql://user:pass@host:5432/db`
- `JWT_SECRET=<minst 32 tecken>`
- `BCRYPT_ROUNDS=12`
- `CORS_ORIGIN=https://app.example.com` (komma-separerad lista vid flera)
- `LOGIN_RATE_LIMIT_WINDOW_MS=900000`
- `LOGIN_RATE_LIMIT_MAX=20`
- `LOGIN_IP_RATE_LIMIT_WINDOW_MS=900000`
- `LOGIN_IP_RATE_LIMIT_MAX=50`
- `LOGIN_MAX_FAILED_ATTEMPTS=5`
- `LOGIN_LOCKOUT_MINUTES=15`
- Ev. `PORT`, `TRUST_PROXY`, `FRONTEND_URL`, `REDIS_URL` etc.

`*_WINDOW_MS` anges i millisekunder (900000 = 15 min).

> Varje kommuninstallation måste använda sin egen `DATABASE_URL` (egen databas).

Exempelrad:

```
BCRYPT_ROUNDS=12   # antal rounds för bcrypt; 12 rek i prod (12–14 ok)
```

## Miljövariabler (frontend / tenant)

Läggs i frontendens `.env` (eller byggmiljö):

- `VITE_API_URL=https://app.example.com/api`
- `VITE_TENANT_ID=vallentuna-oppenvard-vuxen` (alt. `VITE_MUNICIPALITY_CODE`)
- `VITE_MUNICIPALITY_NAME=Vallentuna öppenvård vuxen`
- `VITE_UI_BRAND_NAME=Vallentuna öppenvård vuxen`
- `VITE_SUPPORT_EMAIL=support@vallentuna.se`

I produktion måste tenant‑värden vara satta (templatevärden är bara tillåtna i utveckling).

## Säkerhet/Autentisering

Lösenord hashas med bcrypt. Antal rounds styrs av `BCRYPT_ROUNDS`. Se även `docs/ADMIN_MANUAL.md` för reset-flöde.

- Login rate limiting + kontolåsning styrs av `LOGIN_*`.
- Auditloggning inkluderar login success/failure och admin‑ändringar.

## Bygg och artefakter

- Frontend
  - `npm ci` (i repo-rot)
  - `npm run build`
  - Artefakt: `dist/`

- Backend
  - `cd backend`
  - `npm ci`
  - `npm run build`
  - Artefakt: `backend/dist/`, `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `backend/ecosystem.config.js`

GitHub Actions workflow `Build Artifacts (Manual)` packar dessa och laddar upp som artifacts (`frontend-dist`, `backend-build`).

## Serverkörning (PM2)

1. Kopiera upp artefakter till servern
2. Backend:
   - `cd /srv/statistikappen-vallentuna-oppenvard-vuxen/backend`
   - Lägg `dist/`, `package.json`, `package-lock.json`, `ecosystem.config.js`
   - `cp .env.example .env.production` och fyll i variabler
   - `npm ci --omit=dev`
   - `pm2 start ecosystem.config.js` (startar `dist/index.js` med `NODE_ENV=production`)
   - `pm2 save`
   - Vid uppdatering: `pm2 reload vallentuna-oppenvard-vuxen-backend`

3. Frontend (statisk hosting via Nginx):
   - `cd /srv/statistikappen-vallentuna-oppenvard-vuxen/frontend`
   - Lägg `dist/` och peka Nginx root mot den mappen

## Nginx reverse proxy (exempel)

```
server {
  listen 80;
  server_name app.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name app.example.com;

  ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options nosniff;
  add_header X-Frame-Options DENY;
  add_header Referrer-Policy no-referrer-when-downgrade;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://app.example.com";

  # Frontend (statisk)
  root /srv/statistikappen-vallentuna-oppenvard-vuxen/frontend/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

Justera `proxy_pass` och portar enligt serverkonfiguration. Säkerställ att backend `PORT` stämmer (default 4000).

## Hälsokontroll

- Backend: `GET https://app.example.com/api/healthz` → 200 och JSON med `ok: true`.

## Backup and restore (PostgreSQL)

Recommended schedule:
- Daily backup
- Retention: 30 days (rolling)

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

Optional: point a backend instance at the restored DB and call `/api/healthz`.

## Snabb felsökning

- PM2 loggar: `pm2 logs vallentuna-oppenvard-vuxen-backend`
- CORS-fel: verifiera `CORS_ORIGIN` och Nginx `connect-src` i CSP
- 401/403: kontrollera JWT_SECRET och rollbaserad åtkomst

## Drift-rekommendationer

- Aktivera automatiska backupper för PostgreSQL
- Övervaka CPU/RAM och svarstider
- Rotera loggar, håll auditloggar i 2 år (cleanup-funktion finns)
- Uppdatera certifikat med certbot (cron/systemd timer)

## Gallring/retention

- Auditloggar: 5 år (se `create_audit_log_table.sql` och `docs/RETENTION_POLICY.md`).
- Schemalägg daglig gallring via cron/pg_cron eller anropa `/api/audit/cleanup` från ett serverjobb.
- Lösenordsåterställning/invites är kortlivade (1h/7d). Verksamhetsdata bevaras, ingen hård radering.
