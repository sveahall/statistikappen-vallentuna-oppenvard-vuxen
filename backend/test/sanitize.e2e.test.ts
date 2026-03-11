import express from 'express';
import customersRoutes from '../src/routes/customers';
import casesRoutes from '../src/routes/cases';
import shiftsRoutes from '../src/routes/shifts';
import effortsRoutes from '../src/routes/efforts';
import jwt from 'jsonwebtoken';
import { MockPool } from './helpers/mockPool';

function token(role: string) {
  const secret = process.env.JWT_SECRET || 'testsecret'.repeat(4);
  return jwt.sign({ id: 1, email: 'x@x.se', name: 'X', role, type: 'access' }, secret, { expiresIn: '15m' });
}

async function startApp(pool: MockPool) {
  const app = express();
  app.use(express.json());
  app.use('/api/customers', customersRoutes(pool as any));
  app.use('/api/cases', casesRoutes(pool as any));
  app.use('/api/shifts', shiftsRoutes(pool as any));
  app.use('/api/efforts', effortsRoutes(pool as any));
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'string' ? 80 : (address?.port || 80);
  const base = `http://127.0.0.1:${port}`;
  return { server, base };
}

describe('Sanitization middleware', () => {
  let pool: MockPool; let admin: string;
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'.repeat(4);
    pool = new MockPool();
    admin = token('admin');
  });

  test('Efforts POST strips <script> but keeps normal text', async () => {
    const { server, base } = await startApp(pool);
    try {
      const res = await fetch(`${base}/api/efforts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${admin}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '<script>alert(1)</script>Insats', available_for: 'Behovsprövad' })
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.name.includes('<') || body.name.includes('>')).toBe(false);
      expect(body.available_for).toBe('Behovsprövad');
    } finally { server.close(); }
  });
});

