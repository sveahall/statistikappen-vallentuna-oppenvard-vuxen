-- Archived: legacy dashboard schema and seed (not used by current app)
-- Moved from root/create_dashboard_tables.sql
-- NOTE: Do not run in production.

-- Skapa tabeller för dashboard-funktionalitet

-- 1. Customers tabell
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  initials TEXT NOT NULL,
  gender TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  start_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Efforts tabell (insatser)
CREATE TABLE IF NOT EXISTS efforts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Cases tabell (insatsen)
CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  handler_id INTEGER REFERENCES handlers(id) ON DELETE CASCADE,
  effort_id INTEGER REFERENCES efforts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Aktiv',
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Shifts tabell (tidsregistreringar)
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  handler_id INTEGER REFERENCES handlers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Visits tabell (besök)
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours NUMERIC(4,2),
  status TEXT NOT NULL DEFAULT 'Utförd',
  created_at TIMESTAMP DEFAULT now(),
  active BOOLEAN DEFAULT true
);


-- Skapa index för snabbare sökningar
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(active);
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases(active);
CREATE INDEX IF NOT EXISTS idx_cases_customer ON cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_cases_handler ON cases(handler_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_case ON shifts(case_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
CREATE INDEX IF NOT EXISTS idx_visits_case ON visits(case_id);
