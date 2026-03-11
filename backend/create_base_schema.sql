-- Create base schema required by the application (idempotent)
-- Safe to run multiple times

-- Ensure required extension(s)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Handlers (users)
CREATE TABLE IF NOT EXISTS handlers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'handler' CHECK (role IN ('admin','handler','supervisor')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- optional session-related columns
  refresh_token TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  last_login TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2) Customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  initials TEXT NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  start_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- protected identity flag (may also be added by a separate migration)
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  is_group BOOLEAN NOT NULL DEFAULT FALSE
);

-- 3) Efforts (insatser)
CREATE TABLE IF NOT EXISTS efforts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  available_for TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4) Cases (insatsen)
CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  effort_id INTEGER NOT NULL REFERENCES efforts(id) ON DELETE CASCADE,
  handler1_id INTEGER NOT NULL REFERENCES handlers(id) ON DELETE CASCADE,
  handler2_id INTEGER REFERENCES handlers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Aktiv',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5) Shifts (tidsregistreringar)
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Utförd' CHECK (status IN ('Utförd','Avbokad')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6) Invites (for onboarding)
CREATE TABLE IF NOT EXISTS invites (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'handler' CHECK (role IN ('admin','handler')),
  token_hash TEXT,
  -- token column is optional and may be managed by fix_invites_table.sql
  token TEXT,
  created_by INTEGER REFERENCES handlers(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  used_at TIMESTAMP,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_code TEXT,
  verification_expires_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled'))
);

-- 7) Password reset requests
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES handlers(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Minimal indexes useful without the separate index script
CREATE INDEX IF NOT EXISTS idx_handlers_email ON handlers(email);
CREATE INDEX IF NOT EXISTS idx_handlers_active ON handlers(active);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(active);
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases(active);
CREATE INDEX IF NOT EXISTS idx_cases_customer_id ON cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_cases_effort_id ON cases(effort_id);
CREATE INDEX IF NOT EXISTS idx_shifts_case_id ON shifts(case_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
