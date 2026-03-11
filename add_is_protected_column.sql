-- Add is_protected flag to customers to support anonymous/protected identities
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;

-- Documentation comment
COMMENT ON COLUMN customers.is_protected IS 'True if customer has protected identity. Initials should be masked in API for unauthorized viewers.';

