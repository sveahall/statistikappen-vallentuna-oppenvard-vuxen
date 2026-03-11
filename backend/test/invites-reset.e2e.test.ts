import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import usersRoutes from '../src/routes/users';
import invitesRoutes from '../src/routes/invites';
import authRoutes from '../src/routes/auth';
import { MockPool } from './helpers/mockPool';

async function startApp(pool: MockPool) {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRoutes(pool as any));
  app.use('/api/invites', invitesRoutes(pool as any));
  app.use('/api/auth', authRoutes(pool as any));
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'string' ? 80 : (address?.port || 80);
  const base = `http://127.0.0.1:${port}`;
  return { server, base };
}

describe('Invites and Reset Password', () => {
  let pool: MockPool;
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'.repeat(4);
    process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '12';
    pool = new MockPool();
    // Seed an admin for auth header when creating invites if needed
    const admin = pool.seedHandler('admin@x.se', 'Admin', 'admin');
    // not used directly here since invites route in this app variant returns token in response without mail
  });

  test('Accept invite hashes password with bcrypt-like hash', async () => {
    const { server, base } = await startApp(pool);
    try {
      // Create an invite token in our mock directly (route returns token too, but we mimic accept path)
      const rawToken = crypto.randomBytes(16).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      pool.seedInvite(tokenHash, 'newuser@x.se', 'handler');

      // Accept invite
      const res = await fetch(`${base}/api/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken, password: 'GoodPassw0rd!', name: 'New User' })
      });
      expect(res.status).toBe(200);

      // Verify handler stored has bcrypt-like hash ($2)
      // Look up by email through users login select
      const loginPrep = await pool.query('SELECT * FROM handlers WHERE email = $1 AND active = true', ['newuser@x.se']);
      expect(loginPrep.rows.length).toBe(1);
      const hash = loginPrep.rows[0].password_hash as string;
      expect(hash).toMatch(/^\$2[aby]?\$/);
    } finally {
      server.close();
    }
  });

  test('Reset password then login with new password', async () => {
    const { server, base } = await startApp(pool);
    try {
      // Seed existing user
      const handler = pool.seedHandler('resetuser@x.se', 'Reset User', 'handler', '$2b$12$seedseedseedseedseedseedseedseedseedseedseeds');
      // Create a password reset token for that user
      const rawToken = crypto.randomBytes(16).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      pool.seedPasswordReset(tokenHash, handler.id, handler.email, handler.name);

      // Validate token
      let res = await fetch(`${base}/api/auth/validate-reset-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: rawToken })
      });
      expect(res.status).toBe(200);

      // Reset password
      res = await fetch(`${base}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: rawToken, password: 'N3wGoodPass!' })
      });
      expect(res.status).toBe(200);

      // Now login with new password
      res = await fetch(`${base}/api/users/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'resetuser@x.se', password: 'N3wGoodPass!' })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
    } finally {
      server.close();
    }
  });
});

