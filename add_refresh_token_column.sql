-- Lägg till refresh_token och last_login kolumner i handlers tabellen
-- Detta behövs för att implementera refresh token funktionalitet

ALTER TABLE handlers 
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Skapa index på refresh_token för snabbare sökningar
CREATE INDEX IF NOT EXISTS idx_handlers_refresh_token ON handlers(refresh_token);

-- Kommentar för dokumentation
COMMENT ON COLUMN handlers.refresh_token IS 'JWT refresh token för automatisk token-förnyelse';
COMMENT ON COLUMN handlers.last_login IS 'Senaste inloggningstidpunkt för användaren';
