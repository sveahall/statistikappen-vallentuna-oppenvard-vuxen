import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import statsRoutes from '../../src/routes/stats';
import { statsCache } from '../../src/utils/cache';

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.user = { id: 1, role: 'admin', name: 'Test Admin' };
    next();
  },
}));

describe('GET /stats/summary', () => {
  beforeEach(() => {
    statsCache.clear();
  });

  it('returns filtered metrics together with global active totals', async () => {
    const poolQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // besök
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // kunder i filter
      .mockResolvedValueOnce({ rows: [{ total_hours: '7.5' }] }) // timmar
      .mockResolvedValueOnce({ rows: [{ avbok: '1', total: '5' }] }) // avbokningar/total
      .mockResolvedValueOnce({ rows: [{ aktiva_kunder_total: '12' }] }) // aktiva kunder
      .mockResolvedValueOnce({ rows: [{ aktiva_insatser_total: '20' }] }) // aktiva insatser
      .mockResolvedValueOnce({ rows: [{ new_customers: '3' }] }) // nya kunder
      .mockResolvedValueOnce({ rows: [{ new_cases: '4' }] }); // nya insatser

    const pool = { query: poolQuery } as unknown as Pool;

    const app = express();
    app.use(bodyParser.json());
    app.use('/stats', statsRoutes(pool));

    const res = await request(app).get('/stats/summary');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      antal_besok: 5,
      antal_kunder: 2,
      totala_timmar: 7.5,
      avbokningsgrad: 20,
      aktiva_kunder_total: 12,
      aktiva_insatser_total: 20,
      ny_antal_kunder: 3,
      ny_antal_insatser: 4,
    });
    expect(poolQuery.mock.calls.length).toBe(8);
  });
});
