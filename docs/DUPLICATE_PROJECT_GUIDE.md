# Guide: Duplicera och nollställa projektet för ny kommun

Denna guide hjälper dig att duplicera projektet och anpassa det för en ny kommun.

## 📋 Inloggningsuppgifter

### Befintliga uppgifter (om de finns)
Om du har en befintlig installation kan du hitta admin-användare i databasen:

```sql
SELECT email, name, role FROM handlers WHERE role = 'admin' AND active = true;
```

**OBS:** Det finns en gammal admin-användare i `archive/create_handlers_table.sql`:
- Email: `admin@example.com`
- Lösenord: `admin123`

Men denna används inte längre i produktion och bör inte förlitas på.

### Skapa ny admin-användare

Om du behöver skapa en första admin-användare:

1. **Generera bcrypt-hash för lösenordet** (t.ex. med Node.js):
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('ditt-lösenord', 10).then(h => console.log(h));"
```

2. **Infoga i databasen**:
```sql
INSERT INTO handlers (name, email, password_hash, role, active) 
VALUES ('Admin', 'admin@din-kommun.se', '$2a$10$...din-hash...', 'admin', true);
```

Eller använd invite-systemet (se Admin Manual).

---

## 🔄 Steg för att duplicera projektet

### 1. Klona/kopiera projektet

```bash
# Om du använder git
git clone <repository-url> ny-kommun-projekt
cd ny-kommun-projekt

# Eller kopiera mappen manuellt
cp -r municipality-template ny-kommun-projekt
cd ny-kommun-projekt
```

### 2. Ta bort git-historik (om du vill starta från scratch)

```bash
rm -rf .git
git init
git add .
git commit -m "Initial commit för ny kommun"
```

### 3. Skapa ny PostgreSQL-databas

```bash
# Skapa databas
createdb ny-kommun-db

# Eller via psql
psql -U postgres
CREATE DATABASE "ny-kommun-db";
\q
```

### 4. Konfigurera miljövariabler

Skapa `.env.development` i projektets rot:

```bash
# Backend miljövariabler (skapa i backend/)
DATABASE_URL=postgresql://user:password@localhost:5432/ny-kommun-db
JWT_SECRET=ditt-super-hemligt-jwt-secret-minst-32-tecken-långt
CORS_ORIGIN=http://localhost:5173
PORT=4000
BCRYPT_ROUNDS=10

# Frontend miljövariabler (skapa i rot)
VITE_API_URL=http://localhost:4000/api
VITE_TENANT_ID=din-kommun
VITE_MUNICIPALITY_NAME=Din Kommun Namn
VITE_UI_BRAND_NAME=Din Kommun Namn
VITE_SUPPORT_EMAIL=support@din-kommun.se
```

### 5. Kör databasmigrationer

```bash
cd backend
export DATABASE_URL=postgresql://user:password@localhost:5432/ny-kommun-db
npm run migrate
```

Detta skapar alla tabeller och strukturer.

### 6. Skapa första admin-användare

Se avsnittet "Skapa ny admin-användare" ovan.

---

## 🧹 Nollställ kommunspecifik data

### Steg 1: Rensa databasdata

**VIKTIGT:** Kör detta endast på en ny databas eller efter backup!

```sql
-- Rensa all verksamhetsdata (behåll strukturen)
TRUNCATE TABLE shifts CASCADE;
TRUNCATE TABLE cases CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE efforts CASCADE;
TRUNCATE TABLE handlers CASCADE;
TRUNCATE TABLE invites CASCADE;
TRUNCATE TABLE password_resets CASCADE;
TRUNCATE TABLE audit_log CASCADE;

-- Återställ sekvenser
ALTER SEQUENCE handlers_id_seq RESTART WITH 1;
ALTER SEQUENCE customers_id_seq RESTART WITH 1;
ALTER SEQUENCE efforts_id_seq RESTART WITH 1;
ALTER SEQUENCE cases_id_seq RESTART WITH 1;
ALTER SEQUENCE shifts_id_seq RESTART WITH 1;
ALTER SEQUENCE invites_id_seq RESTART WITH 1;
ALTER SEQUENCE password_resets_id_seq RESTART WITH 1;
```

### Steg 2: Uppdatera tenant-referenser

Sök och ersätt följande i projektet:

#### Filer att uppdatera:

1. **README.md**
   - Uppdatera kommunnamn och UI‑branding
   - Uppdatera beskrivningar

2. **package.json** (rot)
   ```json
   "description": "Din Kommun - Statistik och tidsregistrering system"
   ```

3. **index.html**
   ```html
   <title>Din Kommun - Tidsregistreringssystem</title>
   ```

4. **src/config/env.ts**
   - Standardvärdet för branding styrs via `src/config/tenant.ts` eller `VITE_UI_BRAND_NAME`

5. **src/index.tsx**
   - Uppdatera standard `VITE_UI_BRAND_NAME` om det finns hårdkodat

6. **src/screens/LoginPage/LoginPage.tsx**
   - Ersätt `exempel@din-kommun.se` enligt `tenant.exampleEmail`

7. **src/screens/InviteAcceptPage.tsx**
   - Ersätt `exempel@din-kommun.se` enligt `tenant.exampleEmail`

8. **src/components/Forbidden.tsx**
   - Uppdatera support-email via `tenant.supportEmail`

9. **src/screens/DashboardRedesign/components/Sidebar.tsx**
   - Ersätt logo-fil och alt-text

10. **backend/ecosystem.config.js**
    ```javascript
    name: 'din-kommun-backend'
    ```

11. **docs/DEPLOY_README.md**
    - Uppdatera alla domänreferenser
    - Uppdatera sökvägar (`/srv/municipality-template/` → `/srv/din-kommun/`)

12. **PRODUCTION_REQUIREMENTS.md**
    - Uppdatera domänreferenser

13. **ENVIRONMENT_SETUP.md**
    - Uppdatera exempel med din kommuns namn

14. **DESIGN_SYSTEM.md**
    - Uppdatera färger via `tenant.theme` och `var(--tenant-brand)`

### Steg 3: Ersätt logo

1. Ersätt `public/municipality-logo.svg` med din kommuns logo
2. Uppdatera referenser i `Sidebar.tsx` om filnamnet ändras

### Steg 4: Uppdatera designfärger (valfritt)

Om din kommun har andra färger:

1. Uppdatera `tenant.theme` och `--tenant-brand` i `src/config/tenant.ts`
2. Justera `src/globals.css` om du vill ändra fallback-färger
3. Uppdatera `DESIGN_SYSTEM.md`

---

## ✅ Verifieringschecklista

Efter duplicering och nollställning, verifiera:

- [ ] Databas är tom (inga kunder/insatser/tider)
- [ ] Endast admin-användare finns i `handlers`-tabellen
- [ ] Alla kommunreferenser är ersatta
- [ ] Logo är uppdaterad
- [ ] Miljövariabler är korrekt konfigurerade
- [ ] Frontend startar utan fel (`npm run dev`)
- [ ] Backend startar utan fel (`cd backend && npm run dev`)
- [ ] Inloggning fungerar med ny admin-användare
- [ ] API-endpoints svarar korrekt (`/api/healthz`)

---

## 🚀 Nästa steg

1. **Skapa första behandlare** via Admin → Skapa inbjudan
2. **Lägg till insatser** (efforts) via Admin-gränssnittet
3. **Testa funktionalitet** med testdata
4. **Konfigurera produktion** enligt `DEPLOYMENT.md`

---

## 📝 Noteringar

- **Soft delete:** Projektet använder soft delete (avaktivering) för data. Detta är avsiktligt för att bevara statistik.
- **Audit logging:** Audit-loggar kan behållas eller rensas beroende på behov.
- **Backup:** Ta alltid backup innan du rensar data i produktion!

---

## 🆘 Felsökning

### Problem: Kan inte logga in
- Kontrollera att admin-användaren finns i databasen
- Verifiera att lösenordet är korrekt hashat med bcrypt
- Kontrollera `JWT_SECRET` i miljövariabler

### Problem: API svarar 500
- Kör `npm run migrate` i backend-mappen
- Kontrollera `DATABASE_URL` är korrekt
- Kolla backend-loggar för detaljer

### Problem: Frontend kan inte ansluta till backend
- Verifiera `VITE_API_URL` i `.env`
- Kontrollera CORS-inställningar i backend
- Se till att backend körs på rätt port
