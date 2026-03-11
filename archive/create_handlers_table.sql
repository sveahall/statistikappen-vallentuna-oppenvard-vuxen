-- Archived: legacy handlers bootstrap (dev-only), not used in production
-- Moved from root/create_handlers_table.sql

-- Skapa handlers-tabellen för användarhantering
CREATE TABLE IF NOT EXISTS handlers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'handler' CHECK (role IN ('admin', 'handler')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Skapa en admin-användare för att kunna logga in
-- Lösenord: admin123 (hashad med bcrypt)
INSERT INTO handlers (name, email, password_hash, role, active) VALUES 
('Admin', 'admin@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Skapa index för snabbare sökningar
CREATE INDEX IF NOT EXISTS idx_handlers_email ON handlers(email);
CREATE INDEX IF NOT EXISTS idx_handlers_active ON handlers(active);
