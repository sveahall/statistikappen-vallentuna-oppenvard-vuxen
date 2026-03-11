// Ensure tests run in test environment
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Provide a long-enough JWT secret if not set
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'testsecret_testsecret_testsecret_testsecret';
}

// Default bcrypt rounds for predictable hashing in tests
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '12';

