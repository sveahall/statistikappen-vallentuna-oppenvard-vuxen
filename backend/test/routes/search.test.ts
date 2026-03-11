import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import searchRoutes from '../../src/routes/search';

describe('/api/search', () => {
  it('requires authentication middleware (returns 401 when missing token)', async () => {
    const pool = new Pool();
    const app = express();
    app.use(bodyParser.json());
    app.use((req, _res, next) => {
      (req as any).user = null;
      next();
    });
    app.use(searchRoutes(pool));

    const res = await request(app).get('/?q=test');
    expect(res.status).toBe(401);
  });
});
