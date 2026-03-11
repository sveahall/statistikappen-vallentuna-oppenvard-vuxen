import express from 'express';
import jwt from 'jsonwebtoken';
import effortsRoutes from '../src/routes/efforts';
import { MockPool } from './helpers/mockPool';

function adminToken() {
  const secret = process.env.JWT_SECRET || 'testsecret'.repeat(4);
  return jwt.sign({ id: 1, email: 'admin@x.se', name: 'Admin', role: 'admin', type: 'access' }, secret, { expiresIn: '15m' });
}

async function startApp(pool: MockPool) {
  const app = express();
  app.use(express.json());
  app.use('/api/efforts', effortsRoutes(pool as any));
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'string' ? 80 : (address?.port || 80);
  const base = `http://127.0.0.1:${port}`;
  return { server, base };
}

describe('Efforts activate/deactivate with POST and PUT', () => {
  let pool: MockPool; let token: string;
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'.repeat(4);
    pool = new MockPool();
    token = adminToken();
  });

  test('Create effort then toggle active via POST and PUT variants', async () => {
    const { server, base } = await startApp(pool);
    try {
      // Create
      let res = await fetch(`${base}/api/efforts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'E1', available_for: 'Behovsprövad' })
      });
      expect(res.status).toBe(201);
      const created = await res.json();
      const id = created.id || 123; // Mock returns 123

      // Deactivate via POST
      res = await fetch(`${base}/api/efforts/${id}/deactivate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.active).toBe(false);

      // Activate via POST
      res = await fetch(`${base}/api/efforts/${id}/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.active).toBe(true);

      // Deactivate via PUT (back-compat)
      res = await fetch(`${base}/api/efforts/${id}/deactivate`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.active).toBe(false);

      // Activate via PUT (back-compat)
      res = await fetch(`${base}/api/efforts/${id}/activate`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.active).toBe(true);
    } finally {
      server.close();
    }
  });

  test('Non-admin gets 403 on POST/PUT activate/deactivate', async () => {
    const { server, base } = await startApp(pool);
    const userToken = jwt.sign({ id: 2, email: 'handler@x.se', name: 'Handler', role: 'handler', type: 'access' }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
    try {
      // try POST deactivate
      let res = await fetch(`${base}/api/efforts/123/deactivate`, {
        method: 'POST', headers: { Authorization: `Bearer ${userToken}` }
      });
      expect(res.status).toBe(403);

      // try POST activate
      res = await fetch(`${base}/api/efforts/123/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${userToken}` }
      });
      expect(res.status).toBe(403);

      // try PUT variants
      res = await fetch(`${base}/api/efforts/123/deactivate`, {
        method: 'PUT', headers: { Authorization: `Bearer ${userToken}` }
      });
      expect(res.status).toBe(403);
      res = await fetch(`${base}/api/efforts/123/activate`, {
        method: 'PUT', headers: { Authorization: `Bearer ${userToken}` }
      });
      expect(res.status).toBe(403);
    } finally {
      server.close();
    }
  });
});
