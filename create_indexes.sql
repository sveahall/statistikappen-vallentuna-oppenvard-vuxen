-- Idempotent indexes to improve query performance
-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers (active);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at);
CREATE INDEX IF NOT EXISTS idx_customers_active_created_at ON customers (active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_birth_year ON customers (birth_year) WHERE birth_year IS NOT NULL;
-- Some instances may not have is_protected yet; guard with DO block
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'is_protected'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_customers_is_protected ON customers (is_protected);
  END IF;
END $$;

-- Cases
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases (active);
CREATE INDEX IF NOT EXISTS idx_cases_customer_id ON cases (customer_id);
CREATE INDEX IF NOT EXISTS idx_cases_effort_id ON cases (effort_id);
CREATE INDEX IF NOT EXISTS idx_cases_handler1_id ON cases (handler1_id);
CREATE INDEX IF NOT EXISTS idx_cases_handler2_id ON cases (handler2_id);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases (created_at);
CREATE INDEX IF NOT EXISTS idx_cases_created_at_desc ON cases (created_at DESC);

-- Shifts
CREATE INDEX IF NOT EXISTS idx_shifts_case_id ON shifts (case_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (date);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts (status);
CREATE INDEX IF NOT EXISTS idx_shifts_date_id_desc ON shifts (date DESC, id DESC);
