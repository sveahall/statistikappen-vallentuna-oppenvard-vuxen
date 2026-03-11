-- Skapa audit_log tabell för att logga användaraktivitet
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES handlers(id),
    username VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    entity_name VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Index för snabb sökning
    CONSTRAINT audit_log_created_at_idx UNIQUE (id, created_at)
);

-- Index för sökning
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Kommentarer
COMMENT ON TABLE audit_log IS 'Logg för användaraktivitet och systemändringar';
COMMENT ON COLUMN audit_log.action IS 'Vad användaren gjorde (CREATE, UPDATE, DELETE, LOGIN, etc.)';
COMMENT ON COLUMN audit_log.entity_type IS 'Typ av entitet (customer, case, shift, user, etc.)';
COMMENT ON COLUMN audit_log.entity_id IS 'ID för den påverkade entiteten';
COMMENT ON COLUMN audit_log.entity_name IS 'Namn/beskrivning av entiteten';
COMMENT ON COLUMN audit_log.details IS 'JSON med detaljer om ändringen (gamla/nya värden)';
COMMENT ON COLUMN audit_log.ip_address IS 'Användarens IP-adress';
COMMENT ON COLUMN audit_log.user_agent IS 'Webbläsare/system info';

-- Funktion för att rensa gamla loggar (automatisk rensning)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    -- Ta bort loggar äldre än 5 år (GDPR-kompatibelt)
    DELETE FROM audit_log 
    WHERE created_at < NOW() - INTERVAL '5 years';
    
    -- Logga rensningen
    INSERT INTO audit_log (user_id, username, action, entity_type, details)
    VALUES (NULL, 'SYSTEM', 'CLEANUP', 'audit_log', 
            jsonb_build_object('message', 'Rensade gamla audit loggar', 'cutoff_date', NOW() - INTERVAL '5 years'));
END;
$$ LANGUAGE plpgsql;

-- Schemalägg körning via cron/pg_cron, t.ex. dagligen: SELECT cleanup_old_audit_logs();
