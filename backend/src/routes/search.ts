import { Router } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { sanitizeTextInputs } from "../middleware/validation";
import { getSafeInitials, getSafeNameForCaseContext, generateAlias } from "../utils/alias";
import rateLimit from "express-rate-limit";
import { TOO_MANY_REQUESTS_RESPONSE, rateLimitKeyGenerator } from "../middleware/rateLimit";

interface SearchResult {
  id: number;
  type: 'customer' | 'handler' | 'effort' | 'case' | 'shift';
  title: string;
  subtitle?: string;
  icon: string;
  data: Record<string, unknown>;
}

const MIN_QUERY_LENGTH = 2;
const DEFAULT_PER_TYPE = 5;
const MAX_PER_TYPE = 15;

export default function search(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);
  router.use(rateLimit({
    windowMs: 30 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyGenerator,
    message: TOO_MANY_REQUESTS_RESPONSE,
  }));

  router.get("/", sanitizeTextInputs, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return res.json([]);
    }

    const perType = Math.max(
      1,
      Math.min(Number(req.query.perType) || DEFAULT_PER_TYPE, MAX_PER_TYPE)
    );

    const likeTerm = `%${q}%`;
    const viewerId = req.user?.id || 0;
    const viewerRole = req.user?.role || '';
    const viewerRoleLower = viewerRole.toLowerCase();
    const isAdmin = viewerRoleLower === 'admin';

    try {
      const assigned = await pool.query(
        `SELECT DISTINCT customer_id
         FROM cases
         WHERE active = TRUE AND (handler1_id = $1 OR handler2_id = $1)`,
        [viewerId]
      );
      const assignedSet = new Set<number>(assigned.rows.map((row: any) => Number(row.customer_id)));

      const results: SearchResult[] = [];

      // Customers
      const customers = await pool.query(
        `SELECT id, initials, gender, birth_year, is_protected, is_group, active
         FROM customers
         WHERE active = TRUE AND initials ILIKE $1
         ORDER BY id DESC
         LIMIT $2`,
        [likeTerm, perType]
      );
      for (const row of customers.rows) {
        const safeInitials = getSafeInitials(row, { viewerId, viewerRole, assignedCustomerIds: assignedSet });
        if (row.is_protected && safeInitials === 'Anonym kund') {
          continue;
        }
        const isGroup = !!row.is_group;
        const subtitleParts = [];
        if (isGroup) subtitleParts.push('Grupp');
        else if (row.gender) subtitleParts.push(row.gender);
        if (!isGroup && row.birth_year) subtitleParts.push(`född ${row.birth_year}`);
        results.push({
          id: row.id,
          type: 'customer',
          title: `Kund: ${safeInitials}`,
          subtitle: subtitleParts.join(', ') || undefined,
          icon: 'User',
          data: { id: row.id, is_group: isGroup, is_protected: row.is_protected, can_view: true }
        });
      }

      // Handlers
      const handlers = await pool.query(
        `SELECT id, name, active
         FROM handlers
         WHERE active = TRUE AND name ILIKE $1
         ORDER BY name ASC
         LIMIT $2`,
        [likeTerm, perType]
      );
      for (const row of handlers.rows) {
        results.push({
          id: row.id,
          type: 'handler',
          title: `Behandlare: ${row.name}`,
          icon: 'Users',
          data: { id: row.id }
        });
      }

      // Efforts
      const efforts = await pool.query(
        `SELECT id, name, available_for
         FROM efforts
         WHERE active = TRUE AND name ILIKE $1
         ORDER BY name ASC
         LIMIT $2`,
        [likeTerm, perType]
      );
      for (const row of efforts.rows) {
        results.push({
          id: row.id,
          type: 'effort',
          title: `Insats: ${row.name}`,
          subtitle: row.available_for ? `Tillgänglig för: ${row.available_for}` : undefined,
          icon: 'FileText',
          data: { id: row.id }
        });
      }

      // Cases
      const cases = await pool.query(
        `SELECT
           cases.id,
           cases.customer_id,
           cases.effort_id,
           cases.handler1_id,
           cases.handler2_id,
           cases.active,
           customers.initials AS customer_initials,
           customers.is_protected,
           efforts.name AS effort_name,
           h1.name AS handler1_name,
           h2.name AS handler2_name
         FROM cases
         LEFT JOIN customers ON customers.id = cases.customer_id
         LEFT JOIN efforts ON efforts.id = cases.effort_id
         LEFT JOIN handlers h1 ON h1.id = cases.handler1_id
         LEFT JOIN handlers h2 ON h2.id = cases.handler2_id
         WHERE cases.active = TRUE
           AND (
             customers.initials ILIKE $1 OR
             efforts.name ILIKE $1 OR
             COALESCE(h1.name, '') ILIKE $1 OR
             COALESCE(h2.name, '') ILIKE $1
           )
         ORDER BY cases.id DESC
         LIMIT $2`,
        [likeTerm, perType]
      );
      for (const row of cases.rows) {
        const safeName = getSafeNameForCaseContext(
          {
            customer_id: row.customer_id,
            customer_initials: row.customer_initials,
            is_protected: row.is_protected,
            handler1_id: row.handler1_id,
            handler2_id: row.handler2_id
          },
          { viewerId, viewerRole }
        );
        if (row.is_protected && safeName === 'Anonym kund' && !isAdmin) {
          continue;
        }
        const handlerLabel = row.handler2_name
          ? `${row.handler1_name ?? ''} & ${row.handler2_name}`
          : row.handler1_name ?? undefined;
        results.push({
          id: row.id,
          type: 'case',
          title: `Insats: ${safeName}`,
          subtitle: handlerLabel ? `${row.effort_name ?? ''} • ${handlerLabel}` : row.effort_name ?? undefined,
          icon: 'FileText',
          data: {
            id: row.id,
            customer_id: row.customer_id,
            effort_id: row.effort_id
          }
        });
      }

      // Shifts
      const shifts = await pool.query(
        `SELECT
           shifts.id,
           shifts.date,
           shifts.hours,
           shifts.status,
           cases.id AS case_id,
           cases.handler1_id,
           cases.handler2_id,
           customers.id AS customer_id,
           customers.initials AS customer_initials,
           customers.is_protected,
           efforts.name AS effort_name
         FROM shifts
         LEFT JOIN cases ON cases.id = shifts.case_id
         LEFT JOIN customers ON customers.id = cases.customer_id
         LEFT JOIN efforts ON efforts.id = cases.effort_id
         WHERE shifts.active = TRUE
           AND (
             customers.initials ILIKE $1 OR
             efforts.name ILIKE $1 OR
             TO_CHAR(shifts.date, 'YYYY-MM-DD') ILIKE $1
           )
         ORDER BY shifts.date DESC, shifts.id DESC
         LIMIT $2`,
        [likeTerm, perType]
      );
      for (const row of shifts.rows) {
        const assigned = row.handler1_id === viewerId || row.handler2_id === viewerId;
        let safeName = row.customer_initials;
        if (row.is_protected) {
          if (isAdmin || assigned) {
            safeName = generateAlias(row.customer_id, viewerId);
          } else {
            continue; // dölj skyddade tider för obehöriga
          }
        }
        const dateString = row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : row.date;
        results.push({
          id: row.id,
          type: 'shift',
          title: `Tid: ${safeName} – ${row.effort_name ?? 'Okänd insats'}`,
          subtitle: `${dateString} • ${row.hours}h • ${row.status}`,
          icon: 'Clock',
          data: {
            id: row.id,
            case_id: row.case_id,
            customer_id: row.customer_id,
            date: row.date,
            status: row.status
          }
        });
      }

      res.json(results.slice(0, perType * 5));
    } catch (error) {
      console.error('Error performing global search:', error);
      res.status(500).json({ error: 'Kunde inte utföra sökning' });
    }
  });

  return router;
}
