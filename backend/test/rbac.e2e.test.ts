import express from 'express';
import jwt from 'jsonwebtoken';
import auditRoutes from '../src/routes/audit';
import effortsRoutes from '../src/routes/efforts';
import customersRoutes from '../src/routes/customers';
import { initAuditLogger } from '../src/utils/auditLogger';
import { MockPool } from './helpers/mockPool';

function makeToken(role: string, id = 1) {
  const secret = process.env.JWT_SECRET || 'testsecret'.repeat(4);
  return jwt.sign({ id, email: 'user@test.se', name: role.toUpperCase(), role, type: 'access' }, secret, { expiresIn: '15m' });
}

async function startApp(pool: MockPool) {
  const app = express();
  app.use(express.json());
  initAuditLogger(pool as any);
  app.use('/api/audit', auditRoutes(pool as any));
  app.use('/api/efforts', effortsRoutes(pool as any));
  app.use('/api/customers', customersRoutes(pool as any));
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'string' ? 80 : (address?.port || 80);
  const base = `http://127.0.0.1:${port}`;
  return { server, base };
}

describe('RBAC and routes', () => {
  let pool: MockPool;
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'.repeat(4);
    process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '12';
    pool = new MockPool();
    pool.seedHandler('admin@x.se', 'Admin', 'admin');
    pool.seedHandler('handler@x.se', 'Handler', 'handler');
  });

  test('non-admin cannot POST /api/audit/export and writing /api/efforts*', async () => {
    const { server, base } = await startApp(pool);
    const userToken = makeToken('handler', 2);
    try {
      let res = await fetch(`${base}/api/audit/export`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityName: 'Excel' })
      });
      expect(res.status).toBe(403);

      res = await fetch(`${base}/api/efforts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Namn', available_for: 'Behovsprövad' })
      });
      expect(res.status).toBe(403);
    } finally {
      server.close();
    }
  });

  test('admin can POST /api/audit/export and write /api/efforts*', async () => {
    const { server, base } = await startApp(pool);
    const adminToken = makeToken('admin', 1);
    try {
      let res = await fetch(`${base}/api/audit/export`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityName: 'Excel' })
      });
      expect([200, 204]).toContain(res.status);

      res = await fetch(`${base}/api/efforts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'InsatsX', available_for: 'Behovsprövad' })
      });
      expect(res.status).toBe(201);
    } finally {
      server.close();
    }
  });

  test('customers nested routes return data', async () => {
    const { server, base } = await startApp(pool);
    const token = makeToken('admin', 1);
    try {
      let res = await fetch(`${base}/api/customers/1/efforts`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      const a = await res.json();
      expect(Array.isArray(a)).toBe(true);

      res = await fetch(`${base}/api/customers/1/efforts/2/cases`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      const b = await res.json();
      expect(Array.isArray(b)).toBe(true);
    } finally {
      server.close();
    }
  });
});

