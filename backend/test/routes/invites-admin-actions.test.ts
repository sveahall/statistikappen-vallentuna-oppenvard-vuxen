import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import invitesRoutes from '../../src/routes/invites';

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: () => void) => {
    req.user = { id: 42, role: 'admin' };
    next();
  },
}));

jest.mock('../../src/middleware/requireRole', () => ({
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));

describe('Invites admin actions', () => {
  it('cancels an invite without deleting it', async () => {
    const poolQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // cancel update
      .mockResolvedValueOnce({ rows: [] }); // audit log insert

    const pool = { query: poolQuery } as unknown as Pool;
    const app = express();
    app.use(bodyParser.json());
    app.use('/invites', invitesRoutes(pool));

    const res = await request(app).post('/invites/7/cancel');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Inbjudan avbruten' });
    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery.mock.calls[0][0]).toContain('UPDATE invites');
  });

  it('permanently deletes a previously cancelled invite', async () => {
    const poolQuery = jest
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 9, status: 'cancelled' }] }) // delete
      .mockResolvedValueOnce({ rows: [] }); // audit

    const pool = { query: poolQuery } as unknown as Pool;
    const app = express();
    app.use(bodyParser.json());
    app.use('/invites', invitesRoutes(pool));

    const res = await request(app).delete('/invites/9');

    expect(res.status).toBe(204);
    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery.mock.calls[0][0]).toContain('DELETE FROM invites');
  });
});
