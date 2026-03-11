-- Archived: utility to clear data in development (not for production)
-- Moved from root/clear_database.sql

-- Rensa databasen - behåll endast efforts tabellen
-- Kör detta för att ta bort all testdata

-- Rensa invites först (beroende av handlers)
DELETE FROM invites;

-- Rensa shifts (beroende av cases)
DELETE FROM shifts;

-- Rensa visits (beroende av cases) 
DELETE FROM visits;

-- Rensa cases (beroende av customers, handlers, efforts)
DELETE FROM cases;

-- Rensa handlers
DELETE FROM handlers;

-- Rensa customers
DELETE FROM customers;

-- Återställ sekvenser för att ID:n börjar från 1 igen
ALTER SEQUENCE customers_id_seq RESTART WITH 1;
ALTER SEQUENCE handlers_id_seq RESTART WITH 1;
ALTER SEQUENCE cases_id_seq RESTART WITH 1;
ALTER SEQUENCE shifts_id_seq RESTART WITH 1;
ALTER SEQUENCE visits_id_seq RESTART WITH 1;
ALTER SEQUENCE invites_id_seq RESTART WITH 1;

-- Bekräfta att efforts fortfarande finns
SELECT 'Efforts tabellen behålls med följande data:' as message;
SELECT * FROM efforts;
