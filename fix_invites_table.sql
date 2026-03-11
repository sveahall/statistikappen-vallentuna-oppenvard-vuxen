-- Fixa invites-tabellen för att hantera befintliga kolumner
-- Kör detta i din kommun-databas

-- 1. Lägg till token-kolumn om den saknas (för bakåtkompatibilitet)
ALTER TABLE invites ADD COLUMN IF NOT EXISTS token TEXT;

-- 2. Uppdatera befintliga rader som har NULL i token-kolumnen
UPDATE invites SET token = 'legacy_token_' || id WHERE token IS NULL;

-- 3. Gör token-kolumnen nullable (eftersom vi inte behöver den i det nya systemet)
ALTER TABLE invites ALTER COLUMN token DROP NOT NULL;

-- 4. Lägg till default-värde för token
ALTER TABLE invites ALTER COLUMN token SET DEFAULT 'legacy_token_' || nextval('invites_id_seq');

-- 5. Kontrollera att alla nya kolumner finns
DO $$
BEGIN
    -- Lägg till status om den saknas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invites' AND column_name = 'status') THEN
        ALTER TABLE invites ADD COLUMN status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'));
    END IF;
    
    -- Lägg till created_by om den saknas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invites' AND column_name = 'created_by') THEN
        ALTER TABLE invites ADD COLUMN created_by INTEGER REFERENCES handlers(id);
    END IF;
    
    -- Lägg till email_verified om den saknas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invites' AND column_name = 'email_verified') THEN
        ALTER TABLE invites ADD COLUMN email_verified BOOLEAN DEFAULT false;
    END IF;
    
    -- Lägg till verification_code om den saknas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invites' AND column_name = 'verification_code') THEN
        ALTER TABLE invites ADD COLUMN verification_code TEXT;
    END IF;
    
    -- Lägg till verification_expires_at om den saknas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invites' AND column_name = 'verification_expires_at') THEN
        ALTER TABLE invites ADD COLUMN verification_expires_at TIMESTAMP;
    END IF;
END $$;

-- 6. Uppdatera befintliga invites som saknar status
UPDATE invites SET status = 'pending' WHERE status IS NULL;

-- 7. Uppdatera befintliga invites som saknar created_by
UPDATE invites SET created_by = (SELECT id FROM handlers WHERE role = 'admin' LIMIT 1) WHERE created_by IS NULL;

-- 8. Skapa index om de saknas
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by);
CREATE INDEX IF NOT EXISTS idx_invites_verification_code ON invites(verification_code);

-- 9. Skapa audit log-tabell om den saknas
CREATE TABLE IF NOT EXISTS invite_audit_log (
  id SERIAL PRIMARY KEY,
  invite_id INTEGER REFERENCES invites(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by INTEGER REFERENCES handlers(id),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_audit_log_invite_id ON invite_audit_log(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_audit_log_action ON invite_audit_log(action);

-- 10. Skapa view om den saknas
CREATE OR REPLACE VIEW active_invites AS
SELECT 
  i.id,
  i.email,
  i.status,
  i.created_at,
  i.expires_at,
  i.created_by,
  h.name as created_by_name,
  CASE 
    WHEN i.status = 'pending' AND i.expires_at > NOW() THEN 'Aktiv'
    WHEN i.status = 'pending' AND i.expires_at <= NOW() THEN 'Utgången'
    WHEN i.status = 'accepted' THEN 'Accepterad'
    WHEN i.status = 'cancelled' THEN 'Avbruten'
    ELSE 'Okänd'
  END as status_display
FROM invites i
LEFT JOIN handlers h ON i.created_by = h.id
ORDER BY i.created_at DESC;

-- 11. Visa slutresultatet
SELECT 'Invites-tabellen uppdaterad framgångsrikt!' as result;
