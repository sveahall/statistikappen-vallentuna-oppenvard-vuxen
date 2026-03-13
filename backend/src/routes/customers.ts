import { Router } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { getAuditLogger } from "../utils/auditLogger";
import { getSafeInitials } from "../utils/alias";
import { invalidateStatsCache } from "../utils/cache";
import { requireRole } from "../middleware/requireRole";
import { validateCustomerData, sanitizeTextInputs} from "../middleware/validation";

export default function customers(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);

  // Skapa kund
  router.post("/", sanitizeTextInputs, validateCustomerData, async (req, res) => {
    const { initials, gender, birthYear, startDate, isGroup } = req.body;
    const groupFlag = Boolean(isGroup);
    const genderValue = groupFlag ? null : gender;
    const birthYearValue = groupFlag ? null : birthYear;
    try {
      let result;
      if (startDate) {
        result = await pool.query(
          "INSERT INTO customers (initials, gender, birth_year, active, created_at, is_group) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
          [initials, genderValue, birthYearValue, true, startDate, groupFlag]
        );
      } else {
        result = await pool.query(
          "INSERT INTO customers (initials, gender, birth_year, active, is_group) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [initials, genderValue, birthYearValue, true, groupFlag]
        );
      }
      
      // Logga skapandet av kund (PII minimerad)
      if (req.user) {
        const auditLogger = getAuditLogger(pool);
        const safeName = groupFlag ? `Grupp ${initials}` : `${initials} (${birthYearValue})`;
        await auditLogger.logCreate(
          req.user.id,
          req.user.name, // Använd name istället för username
          'customer',
          result.rows[0].id,
          safeName,
          { initials, gender: genderValue, birthYear: birthYearValue, startDate, isGroup: groupFlag }
        );
      }
      
      invalidateStatsCache();
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Kunde inte skapa kund" });
    }
  });

  // Hämta alla kunder (med stöd för all=true) med säker visning av initialer
  router.get("/", async (req, res) => {
    try {
      const all = req.query.all === "true";
      const sqlWith = all
        ? "SELECT id, initials, gender, birth_year, active, created_at, is_protected, is_group FROM customers ORDER BY id ASC"
        : "SELECT id, initials, gender, birth_year, active, created_at, is_protected, is_group FROM customers WHERE active = TRUE ORDER BY id ASC";
      let rows: any[];
      try {
        const result = await pool.query(sqlWith);
        rows = result.rows;
      } catch (err: any) {
        if (err?.code === '42703') {
          // Fallback: kolumnen finns inte ännu – hämta utan den och anta false
          const sqlWithout = all
            ? "SELECT id, initials, gender, birth_year, active, created_at FROM customers ORDER BY id ASC"
            : "SELECT id, initials, gender, birth_year, active, created_at FROM customers WHERE active = TRUE ORDER BY id ASC";
          const result = await pool.query(sqlWithout);
          rows = result.rows.map((r: any) => ({ ...r, is_protected: false, is_group: false }));
        } else {
          throw err;
        }
      }

      const viewerId = req.user?.id || 0;
      const viewerRole = req.user?.role || '';
      const assigned = await pool.query(
        `SELECT DISTINCT customer_id FROM cases WHERE active = TRUE AND (handler1_id = $1 OR handler2_id = $1)`,
        [viewerId]
      );
      const assignedSet = new Set<number>(assigned.rows.map((r: any) => Number(r.customer_id)));

      const safe = rows.map((row: any) => {
        const initials = getSafeInitials(row, { viewerId, viewerRole, assignedCustomerIds: assignedSet });
        const isAdmin = String(viewerRole).toLowerCase() === 'admin';
        const isAssigned = assignedSet.has(Number(row.id));
        const protectedView = !!row.is_protected && !isAdmin && !isAssigned;
        const gender = protectedView ? null : row.gender;
        const birthYear = row.birth_year;
        const can_view = !row.is_protected || isAdmin || isAssigned;
        return { ...row, initials, gender, birth_year: birthYear, can_view, is_group: !!row.is_group };
      });
      res.json(safe);
    } catch (e) {
      console.error('Error fetching customers:', e);
      res.status(500).json({ error: "Kunde inte hämta kunder" });
    }
  });

  // Avaktivera kund + anonymisera initialer permanent (GDPR)
  router.put("/:id/deactivate", sanitizeTextInputs, async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE customers SET active = FALSE, initials = 'ANONYM' WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Kund hittades inte eller är redan avaktiverad" });
      }
      // Sätt alla kundens aktiva insatsen till inaktiva för att undvika inkonsekvens
      await pool.query(
        'UPDATE cases SET active = FALSE WHERE customer_id = $1 AND active = TRUE',
        [id]
      );
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte avaktivera kund" });
    }
  });

  // Återaktivera kund
  router.put("/:id/activate", sanitizeTextInputs, async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE customers SET active = TRUE WHERE id = $1 RETURNING *",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Kund hittades inte eller är redan aktiv" });
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte återaktivera kund" });
    }
  });

  // Hämta en specifik kund (säker visning av initialer)
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      let row: any;
      try {
        const result = await pool.query("SELECT id, initials, gender, birth_year, active, created_at, is_protected, is_group FROM customers WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Kund hittades inte" });
        row = result.rows[0];
      } catch (err: any) {
        if (err?.code === '42703') {
          const result = await pool.query("SELECT id, initials, gender, birth_year, active, created_at FROM customers WHERE id = $1", [id]);
          if (result.rows.length === 0) return res.status(404).json({ error: "Kund hittades inte" });
          row = { ...result.rows[0], is_protected: false, is_group: false };
        } else {
          throw err;
        }
      }
      const viewerId = req.user?.id || 0;
      const viewerRole = req.user?.role || '';
      const assigned = await pool.query(
        `SELECT 1 FROM cases WHERE customer_id = $1 AND active = TRUE AND (handler1_id = $2 OR handler2_id = $2) LIMIT 1`,
        [id, viewerId]
      );
      const isAdmin = String(viewerRole).toLowerCase() === 'admin';
      const isAssigned = assigned.rows.length > 0;
      if (row.is_protected && !isAdmin && !isAssigned) {
        return res.status(403).json({ error: 'forbidden_protected_customer' });
      }
      const safe = {
        ...row,
        initials: getSafeInitials(row, { viewerId, viewerRole, assignedCustomerIds: new Set<number>(isAssigned ? [Number(id)] : []) }),
        gender: row.is_protected && !isAdmin && !isAssigned ? null : row.gender,
        is_group: !!row.is_group
      };
      res.json(safe);
    } catch (e) {
      console.error('Error fetching customer:', e);
      res.status(500).json({ error: "Kunde inte hämta kund" });
    }
  });

  // Summerad tid för kundens insatser (endast utförda besök)
  router.get("/:id/time", async (req, res) => {
    const { id } = req.params;
    try {
      const customerResult = await pool.query(
        "SELECT id, is_protected FROM customers WHERE id = $1",
        [id]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ error: "Kund hittades inte" });
      }

      const viewerId = req.user?.id || 0;
      const viewerRole = req.user?.role || '';
      const isAdmin = String(viewerRole).toLowerCase() === 'admin';

      if (customerResult.rows[0].is_protected && !isAdmin) {
        const assigned = await pool.query(
          `SELECT 1 FROM cases WHERE customer_id = $1 AND active = TRUE AND (handler1_id = $2 OR handler2_id = $2) LIMIT 1`,
          [id, viewerId]
        );
        if (assigned.rows.length === 0) {
          return res.status(403).json({ error: 'forbidden_protected_customer' });
        }
      }

      const totalResult = await pool.query(
        `SELECT COALESCE(SUM(s.hours), 0) AS total_hours
         FROM shifts s
         INNER JOIN cases c ON c.id = s.case_id
         WHERE c.customer_id = $1 AND s.status = 'Utförd'`,
        [id]
      );

      const total = Number(totalResult.rows[0]?.total_hours ?? 0);
      res.json({ totalHours: Number.isFinite(total) ? total : 0 });
    } catch (error) {
      console.error('Error fetching total hours for customer:', error);
      res.status(500).json({ error: "Kunde inte hämta total tid" });
    }
  });

  // Uppdatera en kund
  router.put("/:id", sanitizeTextInputs, async (req, res) => {
    const { id } = req.params;
    const { initials, gender, birthYear, active, startDate, isGroup } = req.body;
    if (!initials || typeof active !== "boolean") {
      return res.status(400).json({ error: "Initialer och aktiv-status krävs" });
    }
    const groupFlag = typeof isGroup === 'string' ? isGroup.toLowerCase() === 'true' : Boolean(isGroup);
    const genderValue = groupFlag ? null : gender;
    const birthYearValue = groupFlag ? null : Number(birthYear);
    if (!groupFlag) {
      if (!genderValue || birthYearValue == null || Number.isNaN(birthYearValue)) {
        return res.status(400).json({ error: "Kön och födelseår krävs" });
      }
      if (!['Kvinna', 'Man', 'Icke-binär'].includes(genderValue)) {
        return res.status(400).json({ error: "Ogiltigt kön" });
      }
      const currentYear = new Date().getFullYear();
      if (birthYearValue < 1900 || birthYearValue > currentYear) {
        return res.status(400).json({ error: "Ogiltigt födelseår" });
      }
    }
    try {
      // Hämta gamla värden för audit log
      const oldResult = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
      if (oldResult.rows.length === 0) {
        return res.status(404).json({ error: "Kund hittades inte" });
      }
      const oldValues = oldResult.rows[0];
      
      let result;
      const newInitials = active === false ? 'ANONYM' : initials;
      if (startDate) {
        result = await pool.query(
          "UPDATE customers SET initials = $1, gender = $2, birth_year = $3, active = $4, created_at = $5, is_group = $6 WHERE id = $7 RETURNING *",
          [newInitials, genderValue, birthYearValue, active, startDate, groupFlag, id]
        );
      } else {
        result = await pool.query(
          "UPDATE customers SET initials = $1, gender = $2, birth_year = $3, active = $4, is_group = $5 WHERE id = $6 RETURNING *",
          [newInitials, genderValue, birthYearValue, active, groupFlag, id]
        );
      }

      // Om kunden nu är inaktiv, stäng alla aktiva insatsen
      if (active === false) {
        await pool.query(
          'UPDATE cases SET active = FALSE WHERE customer_id = $1 AND active = TRUE',
          [id]
        );
      }
      
      // Logga uppdateringen
      if (req.user) {
        const auditLogger = getAuditLogger(pool);
        const safeName = groupFlag ? `Grupp ${initials}` : `${initials} (${birthYearValue})`;
        await auditLogger.logUpdate(
          req.user.id,
          req.user.name, // Använd name istället för username
          'customer',
          parseInt(id),
          safeName,
          oldValues,
          result.rows[0]
        );
      }
      
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte uppdatera kund" });
    }
  });

  // Ingen hårdradering av kunder — historik/statistik ska bevaras.
  
  // Markera kund som skyddad (admin)
  router.post("/:id/protect", requireRole('admin'), async (req, res) => {
    try {
      const r = await pool.query("UPDATE customers SET is_protected = TRUE WHERE id = $1 RETURNING id, is_protected", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Kund hittades inte" });
      return res.json({ id: r.rows[0].id, is_protected: r.rows[0].is_protected });
    } catch (e: any) {
      if (e?.code === '42703') {
        // Kolumnen saknas – guida utvecklaren istället för 500
        return res.status(409).json({
          error: 'migration_required',
          message: 'Funktionen kräver databas-migration (customers.is_protected). Kör backend/scripts/migrate.sh och försök igen.'
        });
      }
      console.error('Error protecting customer:', e);
      return res.status(500).json({ error: 'Kunde inte markera kund som skyddad' });
    }
  });

  // Avmarkera kund som skyddad (admin)
  router.post("/:id/unprotect", requireRole('admin'), async (req, res) => {
    try {
      const r = await pool.query("UPDATE customers SET is_protected = FALSE WHERE id = $1 RETURNING id, is_protected", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Kund hittades inte" });
      return res.json({ id: r.rows[0].id, is_protected: r.rows[0].is_protected });
    } catch (e: any) {
      if (e?.code === '42703') {
        return res.status(409).json({
          error: 'migration_required',
          message: 'Funktionen kräver databas-migration (customers.is_protected). Kör backend/scripts/migrate.sh och försök igen.'
        });
      }
      console.error('Error unprotecting customer:', e);
      return res.status(500).json({ error: 'Kunde inte avmarkera kund som skyddad' });
    }
  });

  // Admin: Hämta PII (initialer/kön) för anonym kund
  router.get('/:id/pii', requireRole('admin'), async (req, res) => {
    try {
      const r = await pool.query('SELECT id, initials, gender, birth_year, created_at FROM customers WHERE id = $1', [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Kund hittades inte' });
      try {
        const audit = getAuditLogger(pool);
        await audit.logAccess(req.user!.id, req.user!.name, `/customers/${req.params.id}/pii`, 'GET');
      } catch {}
      return res.json(r.rows[0]);
    } catch (e) {
      console.error('Error fetching customer PII:', e);
      return res.status(500).json({ error: 'Kunde inte hämta kunduppgifter' });
    }
  });

  // Hämta alla insatser för en viss kund
  router.get("/:id/efforts", async (req, res) => {
    const { id } = req.params;
    try {
      // Åtkomst: skyddad kund kräver admin eller tilldelad behandlare
      let isProtected = false;
      try {
        const p = await pool.query('SELECT is_protected FROM customers WHERE id = $1', [id]);
        isProtected = !!p.rows[0]?.is_protected;
      } catch (err: any) {
        if (err?.code !== '42703') throw err;
      }
      if (isProtected) {
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin) {
          const viewerId = req.user?.id || 0;
          const asg = await pool.query('SELECT 1 FROM cases WHERE customer_id=$1 AND active=TRUE AND (handler1_id=$2 OR handler2_id=$2) LIMIT 1', [id, viewerId]);
          if (asg.rows.length === 0) return res.status(403).json({ error: 'forbidden_protected_customer' });
        }
      }
      const result = await pool.query(
        `SELECT
          efforts.id AS effort_id,
          efforts.name AS effort_name,
          MIN(cases.date) AS start_date,
          ARRAY_AGG(DISTINCT h) AS handlers
        FROM cases
        LEFT JOIN efforts ON cases.effort_id = efforts.id
        LEFT JOIN handlers h1 ON cases.handler1_id = h1.id
        LEFT JOIN handlers h2 ON cases.handler2_id = h2.id
        LEFT JOIN LATERAL (VALUES (h1.name), (h2.name)) AS hn(h) ON TRUE
        WHERE cases.customer_id = $1
          AND cases.active = TRUE
          AND efforts.active = TRUE
        GROUP BY efforts.id, efforts.name
        ORDER BY start_date ASC`,
        [id]
      );
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: "Kunde inte hämta insatser för kund" });
    }
  });

  // Hämta alla insatsen för en viss kund och insats
  router.get("/:customerId/efforts/:effortId/cases", async (req, res) => {
    const { customerId, effortId } = req.params;
    try {
      // Åtkomst: skyddad kund kräver admin eller tilldelad behandlare
      let isProtected = false;
      try {
        const p = await pool.query('SELECT is_protected FROM customers WHERE id = $1', [customerId]);
        isProtected = !!p.rows[0]?.is_protected;
      } catch (err: any) {
        if (err?.code !== '42703') throw err;
      }
      if (isProtected) {
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdmin) {
          const viewerId = req.user?.id || 0;
          const asg = await pool.query('SELECT 1 FROM cases WHERE customer_id=$1 AND active=TRUE AND (handler1_id=$2 OR handler2_id=$2) LIMIT 1', [customerId, viewerId]);
          if (asg.rows.length === 0) return res.status(403).json({ error: 'forbidden_protected_customer' });
        }
      }
      const result = await pool.query(
        `SELECT
          cases.id,
          cases.date,
          cases.hours,
          cases.status,
          cases.handler1_id,
          cases.handler2_id,
          h1.name AS handler1_name,
          h2.name AS handler2_name
        FROM cases
        LEFT JOIN handlers h1 ON cases.handler1_id = h1.id
        LEFT JOIN handlers h2 ON cases.handler2_id = h2.id
        WHERE cases.customer_id = $1
          AND cases.effort_id = $2
          AND cases.active = TRUE
        ORDER BY cases.id DESC`,
        [customerId, effortId]
      );
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: "Kunde inte hämta insatsen för kund och insats" });
    }
  });

  return router;
}
