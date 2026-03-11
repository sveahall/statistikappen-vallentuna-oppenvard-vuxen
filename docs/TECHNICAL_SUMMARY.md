# Teknisk sammanfattning (kommunal IT‑granskning)

## 1) Systemöversikt
- Webbaserat system för kundhantering, insatser, tidsregistrering och statistik.
- Deployment sker per kommun (separat installation per kommun).

## 2) Data och isolering
- En databas per kommun (ingen delad databas).
- Ingen cross‑tenant‑access möjlig eftersom varje installation endast läser sin egen DATABASE_URL.

## 3) Säkerhetskontroller
- Autentisering med JWT (access + refresh) och rollbaserad åtkomst (admin/handläggare).
- Rate limiting på login samt separat IP‑begränsning; tillfällig kontolåsning efter upprepade fel.
- Säkerhets‑headers: CSP‑baseline, X‑Frame‑Options: DENY, Referrer‑Policy: no‑referrer, Permissions‑Policy med vanliga features avstängda.
- Auditloggning för inloggningar (lyckade/misslyckade) och administrativa ändringar (användare/inbjudningar/roller).

## 4) GDPR och dataskydd
- Kommunen är personuppgiftsansvarig; driftleverantör är personuppgiftsbiträde.
- Lagrad data: användare, kunder, insatser, ärenden och tidsregistreringar samt auditloggar.
- Retention: auditloggar gallras efter 5 år; kortlivade tokens för återställning/invites gallras. Verksamhetsdata hård‑raderas normalt inte; avaktivering används.

## 5) Drift
- Hosting på Linux‑VM (EU/Sverige) med Postgres‑databas.
- Backup dagligen, retention 30 dagar.
- Återställningsövning kvartalsvis (restore drill).

## 6) Incidenthantering
- Detektion via applikations‑ och databasloggar samt hälsokontroll.
- Åtgärd via rollback eller återställning från backup.
- Kommunikation och dokumentation av händelser i driftlogg/ärendehantering.

## 7) Verifiering
- Operativa kontroller finns i `docs/SECURITY_VERIFICATION_CHECKLIST.md`.
