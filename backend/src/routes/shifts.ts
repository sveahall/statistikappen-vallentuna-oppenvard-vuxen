import { Router } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { generateAlias } from "../utils/alias";
import { validateShiftData, sanitizeTextInputs } from "../middleware/validation";
import { resolvePagination } from "../utils/pagination";
import { getAuditLogger } from "../utils/auditLogger";
import { invalidateStatsCache } from "../utils/cache";

export default function shifts(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);
  const auditLogger = getAuditLogger(pool);

  const logSafe = async (cb: () => Promise<void>) => {
    try {
      await cb();
    } catch (err) {
      console.warn('Audit log failed (shifts):', err);
    }
  };

  const getShiftRow = async (id: number) => {
    const result = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    return result.rows[0] || null;
  };

  const toShiftName = (row: { id: number; case_id?: number | null; date?: string | Date }) => {
    const datePart = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
    return `shift:${row.id} (case:${row.case_id ?? '?'}, ${datePart ?? 'date:?'} )`;
  };

  // Hämta alla shifts med relaterad information och filter
  router.get("/", async (req, res) => {
    try {
      const { case_id, customer_id, effort_id, from, to } = req.query;
      
      let whereClause = "WHERE shifts.active = TRUE";
      const params: any[] = [];
      let paramIndex = 1;
      
      if (case_id) {
        whereClause += ` AND shifts.case_id = $${paramIndex}`;
        params.push(case_id);
        paramIndex++;
      }
      
      if (customer_id) {
        whereClause += ` AND cases.customer_id = $${paramIndex}`;
        params.push(customer_id);
        paramIndex++;
      }
      
      if (effort_id) {
        whereClause += ` AND cases.effort_id = $${paramIndex}`;
        params.push(effort_id);
        paramIndex++;
      }
      
      if (from) {
        whereClause += ` AND shifts.date >= $${paramIndex}`;
        params.push(from);
        paramIndex++;
      }
      
      if (to) {
        whereClause += ` AND shifts.date <= $${paramIndex}`;
        params.push(to);
        paramIndex++;
      }
      
      const pagination = resolvePagination(req.query);
      const applyPagination = (sql: string, baseParams: any[]) => {
        if (!pagination) return { sql, params: baseParams };
        const limitPosition = baseParams.length + 1;
        const offsetPosition = baseParams.length + 2;
        return {
          sql: `${sql} LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
          params: [...baseParams, pagination.limit, pagination.offset],
        };
      };

      let result;
      try {
        const baseSql = `
        SELECT shifts.id, shifts.date, shifts.hours, shifts.status,
                cases.id AS case_id,
                cases.handler1_id, cases.handler2_id,
                customers.id AS customer_id,
                customers.initials AS customer_initials,
                customers.is_protected,
                customers.active AS customer_active,
                efforts.name AS effort_name,
                h1.name AS handler1_name,
                h2.name AS handler2_name
         FROM shifts
         LEFT JOIN cases ON shifts.case_id = cases.id
         LEFT JOIN customers ON cases.customer_id = customers.id
         LEFT JOIN efforts ON cases.effort_id = efforts.id
         LEFT JOIN handlers h1 ON cases.handler1_id = h1.id
         LEFT JOIN handlers h2 ON cases.handler2_id = h2.id
         ${whereClause}
         ORDER BY shifts.date DESC, shifts.id DESC`;
        const { sql, params: finalParams } = applyPagination(baseSql, params);
        result = await pool.query(sql, finalParams);
      } catch (err: any) {
        if (err?.code === '42703') {
          // Fallback utan is_protected
          const fallbackSql = `
            SELECT shifts.id, shifts.date, shifts.hours, shifts.status,
                cases.id AS case_id,
                cases.handler1_id, cases.handler2_id,
                customers.id AS customer_id,
                customers.initials AS customer_initials,
                customers.active AS customer_active,
                efforts.name AS effort_name,
                h1.name AS handler1_name,
                h2.name AS handler2_name
           FROM shifts
           LEFT JOIN cases ON shifts.case_id = cases.id
           LEFT JOIN customers ON cases.customer_id = customers.id
           LEFT JOIN efforts ON cases.effort_id = efforts.id
           LEFT JOIN handlers h1 ON cases.handler1_id = h1.id
           LEFT JOIN handlers h2 ON cases.handler2_id = h2.id
           ${whereClause}
           ORDER BY shifts.date DESC, shifts.id DESC`;
          const { sql: fallbackBuilt, params: fallbackParams } = applyPagination(fallbackSql, params);
          result = await pool.query(fallbackBuilt, fallbackParams);
          // tillför pseudo-kolumn
          result.rows = result.rows.map((r: any) => ({ ...r, is_protected: false }));
        } else {
          throw err;
        }
      }
      
      // Konvertera datum till YYYY-MM-DD format för att undvika tidszonsproblem
      const viewerId = req.user?.id || 0;
      const viewerRole = req.user?.role || '';
      let rows = result.rows.map(row => {
        const date = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
        // Compute safe customer name
        const isProtected = !!row.is_protected;
        let safeName = row.customer_initials as string;
        if (isProtected) {
          const assigned = row.handler1_id === viewerId || row.handler2_id === viewerId;
          if (String(viewerRole).toLowerCase() === 'admin' || assigned) {
            safeName = generateAlias(row.customer_id, viewerId);
          } else {
            safeName = 'Anonym kund';
          }
        }
        return {
          id: row.id,
          case_id: row.case_id,
          date,
          hours: row.hours,
          status: row.status,
          customer_name: safeName,
          customer_active: row.customer_active,
          effort_name: row.effort_name,
          handler1_name: row.handler1_name,
          handler2_name: row.handler2_name
        };
      });

      // Dölj skyddade tider helt för icke-admin och icke-tilldelade
      const isAdmin = String(viewerRole).toLowerCase() === 'admin';
      if (!isAdmin) {
        rows = rows.filter((row: any) => row.customer_name !== 'Anonym kund');
      }
      
      res.json(rows);
    } catch (e) {
      console.error("Error fetching shifts:", e);
      res.status(500).json({ error: "Kunde inte hämta shifts" });
    }
  });

  // Skapa ny shift och säkerställ att ett case finns
  router.post("/", sanitizeTextInputs, validateShiftData, async (req, res) => {
    const { case_id, customer_id, effort_id, handler1_id, handler2_id, date, hours, status } = req.body;
    if ((!case_id && (!customer_id || !effort_id || !handler1_id)) || !date || hours === undefined) {
      return res.status(400).json({ error: "Obligatoriska fält saknas" });
    }
    try {
      let caseId: number = case_id;
      if (!caseId) {
        // Om vi riskerar att skapa ett nytt insats: stoppa om kunden är skyddad och användaren inte är admin
        try {
          let custRow: any;
          try {
            const r = await pool.query('SELECT is_protected FROM customers WHERE id = $1', [Number(customer_id)]);
            custRow = r.rows[0];
          } catch (err: any) {
            if (err?.code === '42703') {
              custRow = { is_protected: false };
            } else { throw err; }
          }
          if (custRow?.is_protected && String(req.user?.role).toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Endast admin kan skapa nya insatsen för skyddad kund' });
          }
        } catch {}
        const existing = await pool.query(
          `SELECT id FROM cases WHERE customer_id = $1 AND effort_id = $2 AND handler1_id = $3 AND (handler2_id = $4 OR (handler2_id IS NULL AND $4 IS NULL)) LIMIT 1`,
          [customer_id, effort_id, handler1_id, handler2_id || null]
        );
        if (existing.rows.length > 0) {
          caseId = existing.rows[0].id;
        } else {
          const caseResult = await pool.query(
            `INSERT INTO cases (customer_id, effort_id, handler1_id, handler2_id, active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING id`,
            [customer_id, effort_id, handler1_id, handler2_id || null]
          );
          caseId = caseResult.rows[0].id;
        }
      }

      const result = await pool.query(
        `INSERT INTO shifts (case_id, date, hours, status, active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING *`,
        [caseId, date, hours, status || 'Utförd']
      );
      const createdShift = result.rows[0];
      res.status(201).json(createdShift);
      invalidateStatsCache();

      if (req.user) {
        await logSafe(() => auditLogger.logCreate(
          req.user!.id,
          req.user!.name,
          'shift',
          createdShift.id,
          toShiftName(createdShift),
          createdShift
        ));
      }
    } catch (e) {
      console.error("Error creating shift:", e);
      res.status(500).json({ error: "Kunde inte skapa shift" });
    }
  });

  // Uppdatera befintlig shift
  router.put("/:id", sanitizeTextInputs, async (req, res) => {
    const { id } = req.params;
    const { date, hours, status } = req.body;
    
    if (!date || hours === undefined || hours <= 0) {
      return res.status(400).json({ error: "Obligatoriska fält saknas eller ogiltiga värden" });
    }

    // Validera status om den skickas
    if (typeof status !== 'undefined' && !['Utförd', 'Avbokad'].includes(String(status))) {
      return res.status(400).json({ error: "Ogiltig status. Tillåtna: Utförd, Avbokad" });
    }
    
    const shiftId = Number(id);
    const existingShift = await getShiftRow(shiftId);
    if (!existingShift || existingShift.active === false) {
      return res.status(404).json({ error: "Shift hittades inte" });
    }

    try {
      const result = await pool.query(
        `UPDATE shifts 
         SET date = $1, hours = $2, status = $3 
         WHERE id = $4 AND active = TRUE 
         RETURNING *`,
        [date, hours, status, shiftId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Shift hittades inte" });
      }
      const updatedShift = result.rows[0];
      res.json(updatedShift);
      invalidateStatsCache();

      if (req.user) {
        await logSafe(() => auditLogger.logUpdate(
          req.user!.id,
          req.user!.name,
          'shift',
          shiftId,
          toShiftName(updatedShift),
          existingShift,
          updatedShift
        ));
      }
    } catch (e) {
      console.error("Error updating shift:", e);
      res.status(500).json({ error: "Kunde inte uppdatera shift" });
    }
  });

  // Inaktivera shifts som tillhör ett specifikt case (soft delete - INGEN permanent radering!)
  router.put("/case/:caseId/deactivate", sanitizeTextInputs, async (req, res) => {
    const { caseId } = req.params;
    
    try {
      const result = await pool.query(
        `UPDATE shifts SET active = FALSE WHERE case_id = $1 AND active = TRUE`,
        [caseId]
      );
      
      const rowCount = result.rowCount ?? 0;
      res.json({ 
        message: `Inaktiverade ${rowCount} shifts för case ${caseId}`,
        deactivatedCount: rowCount 
      });
      if (rowCount > 0) {
        invalidateStatsCache();
      }
    } catch (e) {
      console.error("Error deactivating shifts for case:", e);
      res.status(500).json({ error: "Kunde inte inaktivera shifts för case" });
    }
  });

  return router;
}
