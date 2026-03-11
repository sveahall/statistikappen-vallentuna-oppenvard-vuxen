# Security Verification Checklist

Practical operator checks with copy‑paste commands. Use a non‑production window where possible.

## 1) Verify security headers
```
API_BASE=http://localhost:4000
curl -I "$API_BASE/api/healthz" | rg -i 'content-security-policy|x-frame-options|referrer-policy|permissions-policy'
```

## 2) Verify CORS restricted to configured origin
```
API_BASE=http://localhost:4000
ALLOWED_ORIGIN=http://localhost:5173
DISALLOWED_ORIGIN=http://evil.example

curl -i -X OPTIONS "$API_BASE/api/handlers" \
  -H "Origin: $ALLOWED_ORIGIN" \
  -H 'Access-Control-Request-Method: GET' | rg -i 'access-control-allow-origin'

curl -i -X OPTIONS "$API_BASE/api/handlers" \
  -H "Origin: $DISALLOWED_ORIGIN" \
  -H 'Access-Control-Request-Method: GET' | rg -i 'access-control-allow-origin'
```

## 3) Verify login rate limiting (expect 429)
```
API_BASE=http://localhost:4000
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API_BASE/api/users/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"rate@test.local","password":"bad"}'
done | tail -n 1
```

## 4) Verify account lockout triggers and clears after cooldown
```
API_BASE=http://localhost:4000
EMAIL=lockout@test.local
PASSWORD=bad

# Trigger lockout (repeat until 429)
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API_BASE/api/users/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
done | tail -n 1

# Wait for cooldown (LOGIN_LOCKOUT_MINUTES), then try again
sleep 60  # adjust to your configured cooldown
curl -i -X POST "$API_BASE/api/users/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | rg -n 'HTTP/|account_locked'
```

## 5) Verify audit logging writes rows
```
DATABASE_URL='postgresql://user:pass@host:5432/db'
psql "$DATABASE_URL" -c "SELECT action, entity_type, entity_id, ip_address, created_at FROM audit_log ORDER BY id DESC LIMIT 10;"
```
Expect to see:
- `LOGIN_FAILED`
- `LOGIN` (success)
- Admin action (e.g. `INVITE_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`)

## 6) Verify JWT secret length and non‑default
```
# Check length only (do not echo the secret in logs)
python - <<'PY'
import os
s = os.getenv('JWT_SECRET', '')
print('length', len(s))
print('ok', len(s) >= 32)
PY
```

## 7) Verify database separation per tenant
```
DATABASE_URL='postgresql://user:pass@host:5432/db'
python - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ['DATABASE_URL'])
print('db_name', u.path.lstrip('/'))
PY
```
Confirm the DB name matches the tenant and does not include "template" or "dev" in production.

## 8) Verify backups exist and retention is enforced
```
TENANT_ID=example
BACKUP_DIR=/var/backups/municipality-template/$TENANT_ID
ls -lh "$BACKUP_DIR" | head -n 5
find "$BACKUP_DIR" -type f -name "${TENANT_ID}_*.dump" -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort | head -n 3
```

## 9) Verify restore drill evidence template exists
```
ls -l docs/RESTORE_DRILL_CHECKLIST.md
```
Record drill evidence in your ops log or ticket system.
