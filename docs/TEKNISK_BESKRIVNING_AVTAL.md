# Teknisk beskrivning – metoder och teknik (för avtal)

Detta dokument beskriver de metoder och tekniker som används i systemet, avsett som bilaga eller referens i avtal mellan beställare och leverantör.

---

## 1. Arkitektur och teknikval

### 1.1 Översikt
- **Typ:** Webbaserat klient–server-system (single-page application + REST API).
- **Deployment:** En installation per kommun; ingen delad infrastruktur mellan kommuner.
- **Språk:** TypeScript (frontend och backend).

### 1.2 Frontend (klient)
- **Ramverk:** React 18 med React Router.
- **Byggverktyg:** Vite.
- **UI:** Tailwind CSS, Radix UI-komponenter, Lucide-ikoner.
- **Diagram och export:** Recharts (statistik), jsPDF/html2canvas (PDF), xlsx (Excel).
- **Validering:** Zod (scheman och validering på klienten).
- **Kommunikation:** HTTPS mot backend; JWT i Authorization-header för autentiserade anrop.

### 1.3 Backend (server)
- **Runtime:** Node.js.
- **Ramverk:** Express.
- **Databas:** PostgreSQL (en databas per kommun; ingen delad databas mellan installationer).
- **Databasåtkomst:** Connection pool (pg) med konfigurerbar min/max antal anslutningar.

### 1.4 Transport och format
- **Protokoll:** HTTPS (TLS) rekommenderas i produktion.
- **API:** REST över HTTP/HTTPS; JSON som request/response-format.
- **Storleksbegränsning:** Request body begränsad till 1 MB (Express).

---

## 2. Autentisering och åtkomstkontroll

### 2.1 Autentisering
- **Metod:** JWT (JSON Web Tokens) med access- och refresh-token.
- **Access-token:** Kort livstid (konfigurerbar, standard 15 minuter); används i varje API-anrop.
- **Refresh-token:** Längre livstid (konfigurerbar, standard 7 dagar); lagras säkert; används för att förnya access-token utan att logga in igen.
- **Lösenord:** Lagras aldrig i klartext. Hashning med bcrypt med konfigurerbart antal rundor (standard 12).

### 2.2 Åtkomstkontroll
- **Roller:** Rollbaserad åtkomst (RBAC). Roller: admin, handler, supervisor.
- **Autorisering:** Varje skyddad API-endpoint kontrollerar JWT och användarens roll; endast tillåtna roller får utföra respektive åtgärd.
- **Session:** Ingen server-side sessionlagring; tillstånd bärs av JWT. Refresh-token kan sparas i databasen för ogiltigförklaring vid utloggning.

### 2.3 Skydd mot missbruk
- **Rate limiting (globalt):** Begränsning av antal requests per IP per tidsfönster (konfigurerbart).
- **Rate limiting (inloggning):** Särskild begränsning per IP och per e-postadress vid inloggningsförsök; lyckade inloggningar räknas inte.
- **Kontolåsning:** Efter ett konfigurerbart antal misslyckade inloggningsförsök låses kontot tillfälligt (konfigurerbar varaktighet i minuter).
- **Lösenordsåterställning och inbjudningar:** Token för återställning/inbjudan hashas (SHA-256) innan lagring; endast hash lagras i databasen.

---

## 3. Säkerhetstekniker

### 3.1 HTTP-säkerhetsheaders
- **Helmet:** Används för att sätta säkerhetsrelaterade HTTP-headers.
- **Content-Security-Policy (CSP):** Aktiverad med standardinställningar; frame-ancestors satt till 'none'.
- **X-Frame-Options:** DENY (ingen inbäddning i iframes).
- **Referrer-Policy:** no-referrer.
- **Permissions-Policy:** Begränsning av webbläsarfunktioner (t.ex. geolocation, mikrofon, kamera, payment, usb).

### 3.2 CORS (Cross-Origin Resource Sharing)
- **Origin:** Endast konfigurerade domäner (CORS_ORIGIN) tillåts; ingen wildcard i produktion.
- **Metoder:** GET, POST, PUT, PATCH, DELETE, OPTIONS.
- **Headers:** Authorization, Content-Type, X-Requested-With.
- **Credentials:** Konfigurerbart (cookies/credentials vid behov).

### 3.3 Validering och sanitering av indata
- **Server-side validering:** All relevant indata valideras på servern (format, längd, tillåtna värden).
- **Regler:** T.ex. e-post (regex), lösenord (minst 8 tecken, minst en bokstav och en siffra), namn (bokstäver, mellanslag, bindestreck), datum (YYYY-MM-DD), timmar (0–24), ID:n (positiva heltal).
- **Sanitering:** Textfält saniteras (borttagning av t.ex. &lt;, &gt;, javascript:, event-handlers) innan lagring eller vidare användning för att minska risk för XSS och injection.

### 3.4 Databas
- **Frågor:** Parametriserade frågor (prepared statements) används överallt; ingen konkatenering av användarindata i SQL.
- **Anslutning:** Krypterad anslutning till databasen (TLS) rekommenderas i produktion.

---

## 4. Datahantering och integritet

### 4.1 Datamodell (kärna)
- **Entiteter:** Användare (handlers), kunder (customers), insatser (efforts), ärenden/insatser per kund (cases), tidsregistreringar (shifts), inbjudningar (invites), lösenordsåterställningar (password_resets), auditlogg (audit_log).
- **Relationer:** Foreign keys med CASCADE/restrict enligt behov; referensintegritet hanteras i databasen.
- **Mjuk radering:** Verksamhetsdata avaktiveras (active = false) i stället för hård radering, utom där annat anges (t.ex. gallring av loggar).

### 4.2 Känslig data
- **Skyddade kunder:** Flagga (is_protected) för särskilt skyddade identiteter; påverkar vilka fält som exponeras i API och gränssnitt.
- **Lösenord och tokens:** Endast hashvärden lagras (bcrypt för lösenord, SHA-256 för vissa tokens).
- **Auditlogg:** Lagrar användar-ID, användarnamn, åtgärd, entitetstyp, entitets-ID, IP-adress och user agent; inga lösenord eller tokens.

### 4.3 Backup och återställning
- **Metod:** Databasbackup (t.ex. pg_dump) enligt konfigurerat schema (rekommenderat dagligen).
- **Retention:** Konfigurerbar (rekommendation 30 dagar).
- **Återställningsövning:** Rekommenderas kvartalsvis (restore drill) och dokumenteras.

---

## 5. Granskningsloggning (audit)

### 5.1 Vad loggas
- Lyckade och misslyckade inloggningar (användare, IP, user agent).
- Administrativa åtgärder: skapande/ändring/radering av användare, inbjudningar, roller.
- Övriga känsliga eller administrativa åtgärder enligt implementationen.

### 5.2 Lagring och gallring
- **Lagring:** Poster i dedikerad tabell (audit_log) i samma databas.
- **Retention:** Auditloggar gallras efter 5 år (automatisk eller schemalagd körning av cleanup-funktion).
- **Åtkomst:** Endast behöriga roller (t.ex. admin) kan läsa auditlogg via applikationen.

---

## 6. Dataskydd och retention (kort)

- **Personuppgiftsansvarig:** Kommunen.
- **Biträde:** Driftleverantör som personuppgiftsbiträde.
- **Auditloggar:** 5 år, därefter gallring.
- **Lösenordsåterställning:** Token giltig kort tid (t.ex. 1 timme); förfallna och använda rader rensas.
- **Inbjudningar:** Begränsad giltighetstid (t.ex. 7 dagar); förfallna kan rensas.
- **Verksamhetsdata:** Ingen hård radering som standard; avaktivering och anonymisering enligt policy (t.ex. vid avaktivering av kund).

---

## 7. Drift och värdmiljö

- **Server:** Linux-baserad värd (rekommenderat i EU/Sverige för personuppgifter).
- **Databas:** PostgreSQL; en instans per kommun.
- **Processhantering:** Node.js-process(er) (t.ex. PM2 eller systemd enligt konfiguration).
- **Hälsokontroll:** Endpoint (t.ex. /health) för enkel kontroll av applikationens tillgänglighet.
- **Loggning:** Applikations- och felför loggning; loggar används för felsökning och incidenthantering.

---

## 8. Versionshantering och kvalitet

- **Källkod:** Versionshantering (t.ex. Git); ändringar spåras.
- **Körningar:** Automatiserade tester (t.ex. enhetstester och API-tester) för backend; bygg- och testpipeline enligt projektsättning.
- **Konfiguration:** Känslig konfiguration (databas-URL, JWT-hemlighet, etc.) hanteras via miljövariabler; ingen känslig data i källkoden.

---

*Detta dokument kan användas som teknisk bilaga i avtal. Uppdateringar av metoder eller tekniker bör återspeglas i dokumentet och, vid behov, i avtalsändringar.*
