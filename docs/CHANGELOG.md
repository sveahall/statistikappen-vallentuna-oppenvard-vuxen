# Changelog

## 2025-02-10 – Pagination & Audit Hardening

- Added `/api/search` endpoint with per-user rate limiting and frontend integration for global sökningar.
- Paginated `/api/cases`, `/api/shifts`, `/api/customers`; frontend insatslistan (`/arendelista`) har “Ladda fler”.
- Introduced in-memory cache för statistik (`/api/stats/*`) för att avlasta databasen.
- Reworked skapande/uppdatering av insatser (cases) och tidsregistreringar (shifts) så att alla ändringar loggas i `audit_log`.
- Förhindrar återaktivering av anonymiserade kunder och blockerar osäker återaktivering i UI.
- Lade på förbättrad felhantering (Försök igen) på Registrera Tid och Insatslista samt disabled filter på Statistik när listor laddas.
- Login-formuläret har nu korrekta `autocomplete`-attribut enligt browser-rekommendationer.
