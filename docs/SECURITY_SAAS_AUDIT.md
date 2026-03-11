# Säkerhetsgranskning – SaaS-beredskap

Granskning utförd för att säkerställa att systemet är säkert, stabilt och redo att säljas som SaaS-tjänst till kommuner.

## Sammanfattning

| Område | Status | Kommentar |
|--------|--------|-----------|
| Autentisering | ✅ God | JWT, bcrypt, rate limiting, konto-låsning |
| Auktorisering | ✅ God | Rollbaserad åtkomst, admin/behandlare-isolering |
| SQL-injection | ✅ God | Parameteriserade queries överallt |
| XSS | ✅ God | Inga dangerouslySetInnerHTML med användardata |
| CORS | ✅ God | Konfigurerbart, begränsat till CORS_ORIGIN |
| Säkerhetsheaders | ✅ God | Helmet, X-Frame-Options, CSP |
| Känslig data | ✅ God | Skyddad identitet (is_protected), PII-maskning |
| Multi-tenant | ✅ God | En databas per kommun, inga "template/dev" i prod |
| Audit logging | ✅ God | Login, admin-åtgärder, export (nu med auto-skapande av tabell) |

---

## Detaljerad granskning

### 1. Backend-säkerhet

**Autentisering**
- JWT access + refresh tokens
- bcrypt för lösenord (konfigurerbar BCRYPT_ROUNDS)
- Rate limiting på login (per IP + per e-post)
- Konto-låsning efter misslyckade försök (`LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`)

**Auktorisering**
- `authenticateToken` på skyddade routes
- `requireRole('admin')` för admin-endpoints (handlers, invites, audit, kund-skydd)
- Skyddad identitet: endast admin eller tilldelad behandlare ser full PII

**Databas**
- Alla SQL-frågor använder parametrar (`$1`, `$2`, etc.) – ingen strängkonkatenering med användardata
- Sökningen (`search.ts`) använder parametriserade ILIKE-frågor

**Validering**
- `validateUserRegistration`, `validateCustomerData`, `validateShiftData`, `validateCaseData`
- `sanitizeTextInputs` – tar bort `<`, `>`, `javascript:`, event handlers
- Lösenord: minst 8 tecken, bokstav + siffra

### 2. Frontend-säkerhet

**XSS**
- Ingen `dangerouslySetInnerHTML` med användardata
- React escapar automatiskt utdata
- Felmeddelande vid env-validering använder endast våra egna strängar

**Autentisering**
- Tokens i sessionStorage/localStorage (beroende på "Kom ihåg mig")
- ProtectedRoute kontrollerar roll
- API-klienten skickar Bearer-token och hanterar 401 + refresh

### 3. Konfiguration och miljövariabler

**Känsliga variabler (.gitignore)**
- `.env`, `.env.local`, `.env.*` ignoreras
- Backend `.env*` ignoreras

**Backend (produktion)**
- `DATABASE_URL`, `JWT_SECRET` (minst 32 tecken), `CORS_ORIGIN` krävs
- Produktion blockerar databasnamn med "template" eller "dev"

**Frontend**
- `VITE_API_URL` krävs
- `VITE_TENANT_ID` m.m. valideras i produktion (inga template-värden)

### 4. Multi-tenant / SaaS-isolering

- **En databas per kommun** – ingen tenant_id i schemat, full databas-isolering
- Produktionskontroll: DATABASE_URL får inte innehålla "template" eller "dev"
- Varje installation har egen `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`

### 5. Ändringar gjorda under granskningen

1. **audit_log auto-skapande** – Tabellen `audit_log` skapas nu automatiskt vid start om den saknas, så inloggning och audit-logging inte faller även om endast `create_base_schema.sql` körts (t.ex. vid snabb setup).

---

## Åtgärder före produktionslansering

### Kritiskt (måste göras)
- [ ] Kör `backend/scripts/migrate.sh` vid ny installation (eller bekräfta att `ensureAuditLog` skapar tabellen)
- [ ] Sätt stark `JWT_SECRET` (minst 32 slumpmässiga tecken)
- [ ] Sätt `CORS_ORIGIN` exakt till frontend-URL (t.ex. `https://app.kommun.se`)
- [ ] Aktivera HTTPS (reverse proxy med Nginx/Caddy)

### Rekommenderat
- [ ] Schemalägg `cleanup_old_audit_logs()` (cron/pg_cron) för auditlogg-retention
- [ ] Backup av databas enligt RETENTION_POLICY
- [ ] Övervaka audit_log och fel under drift

### Vid SaaS-leverans till ny kommun
1. Skapa ny PostgreSQL-databas
2. Kör `migrate.sh` (eller motsvarande schema-setup)
3. Skapa första admin via invite eller manuell INSERT
4. Konfigurera `.env` med kommunens värden
5. Deploya med egen `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`

---

## Referenser

- `docs/SECURITY_VERIFICATION_CHECKLIST.md` – praktiska kontroller
- `PRODUCTION_REQUIREMENTS.md` – kapacitet och krav
- `docs/RETENTION_POLICY.md` – datalagring
- `docs/DEPLOYMENT.md` – deployment-guide
