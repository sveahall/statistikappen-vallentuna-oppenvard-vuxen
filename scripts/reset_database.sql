-- Skript för att nollställa databasen (ta bort all verksamhetsdata)
-- VIKTIGT: Kör detta endast på en ny databas eller efter backup!
-- 
-- Användning:
--   psql "$DATABASE_URL" -f scripts/reset_database.sql

BEGIN;

-- Rensa all verksamhetsdata (behåll strukturen)
-- Ordningen är viktig p.g.a. foreign keys
TRUNCATE TABLE shifts CASCADE;
TRUNCATE TABLE cases CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE efforts CASCADE;
TRUNCATE TABLE invites CASCADE;
TRUNCATE TABLE password_resets CASCADE;

-- Rensa audit log (valfritt - kan behållas för historik)
-- TRUNCATE TABLE audit_log CASCADE;

-- Rensa handlers (användare) - OBS: Detta tar bort ALLA användare!
-- Om du vill behålla admin-användare, kommentera ut raden nedan
-- och skapa admin-användare manuellt efteråt
TRUNCATE TABLE handlers CASCADE;

-- Återställ sekvenser till 1
ALTER SEQUENCE IF EXISTS handlers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS customers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS efforts_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS cases_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS shifts_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS invites_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS password_resets_id_seq RESTART WITH 1;

COMMIT;

-- Efter att detta skript körts behöver du skapa en ny admin-användare
-- Se DUPLICATE_PROJECT_GUIDE.md för instruktioner
