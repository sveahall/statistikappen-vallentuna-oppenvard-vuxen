import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import shiftsRoutes from '../../src/routes/shifts';

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.user = { id: 1, role: 'admin', name: 'Test Admin' };
    next();
  },
}));

describe('POST /api/shifts', () => {
  it('creates a shift by reusing existing case when case_id is missing', async () => {
    const pool = {
      query: jest
        .fn()
        // SELECT is_protected FROM customers ...
        .mockResolvedValueOnce({ rows: [{ is_protected: false }] })
        // SELECT id FROM cases ...
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        // INSERT INTO shifts ... RETURNING *
        .mockResolvedValueOnce({
          rows: [{
            id: 99,
            case_id: 42,
            date: '2025-01-01',
            hours: 2,
            status: 'Utförd',
            active: true,
          }],
        })
        // Audit logger user validation query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // Audit log insert
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool;

    const app = express();
    app.use(bodyParser.json());
    app.use('/shifts', shiftsRoutes(pool));

    const payload = {
      customer_id: 10,
      effort_id: 5,
      handler1_id: 3,
      handler2_id: null,
      date: '2025-01-01',
      hours: 2,
      status: 'Utförd',
    };

    const res = await request(app).post('/shifts').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.case_id).toBe(42);
    expect((pool.query as unknown as jest.Mock).mock.calls.length).toBe(5);
  });
});
