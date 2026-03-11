-- Add login lockout columns for brute-force protection (idempotent)
ALTER TABLE handlers
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE handlers
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;
