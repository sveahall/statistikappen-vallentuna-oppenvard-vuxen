-- Archived: manual test helper for audit logs
-- Moved from root/test_audit_log.sql

-- Test audit log funktionalitet
-- Kör detta för att se att allt fungerar

-- 1. Kolla att tabellen finns
SELECT 'Audit log tabell struktur:' as info;
\d audit_log;

-- 2. Kolla befintliga loggar
SELECT 'Befintliga loggar:' as info;
SELECT id, username, action, entity_type, created_at 
FROM audit_log 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Testa cleanup-funktionen
SELECT 'Testar cleanup-funktion:' as info;
SELECT cleanup_old_audit_logs();

-- 4. Kolla loggar efter cleanup
SELECT 'Loggar efter cleanup:' as info;
SELECT id, username, action, entity_type, created_at 
FROM audit_log 
ORDER BY created_at DESC 
LIMIT 5;
