import { Router } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { validateSearchParams, sanitizeTextInputs } from "../middleware/validation";
import { getSafeNameForCaseContext } from "../utils/alias";
import { statsCache } from "../utils/cache";

export default function stats(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);

  const buildCacheKey = (prefix: string, req: any) => {
    return `${prefix}:${JSON.stringify(req.query || {})}:${req.user?.id ?? 'anon'}`;
  };

  // Statistik: summeringar
  router.get("/summary", sanitizeTextInputs, validateSearchParams, async (req, res) => {
    const cacheKey = `summary:${JSON.stringify(req.query || {})}:${req.user?.id ?? 'anon'}`;
    const cached = statsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];

    if (from) {
      params.push(String(from));
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(String(to));
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    if (effortCategory) {
      const categories = String(effortCategory).split(",");
      const likeConditions = categories.map((_, index) => 
        `efforts.available_for ILIKE $${params.length + index + 1}`
      ).join(" OR ");
      
      where += ` AND (${likeConditions})`;
      params.push(...categories.map(cat => `%${cat.trim()}%`));
    }
    if (gender) {
      const genders = String(gender).split(",");
      where += ` AND customers.gender = ANY($${params.length + 1})`;
      params.push(genders);
    }
    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      where += ` AND customers.birth_year = ANY($${params.length + 1})`;
      params.push(years);
    }
    if (customer) {
      const customers = String(customer).split(",").map(Number);
      where += ` AND cases.customer_id = ANY($${params.length + 1})`;
      params.push(customers);
    }
    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      where += ` AND (cases.handler1_id = ANY($${params.length + 1}) OR cases.handler2_id = ANY($${params.length + 1}))`;
      params.push(handlers);
    }

    // Aktiv/inaktiv filter (standard: endast aktiva)
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }

    // Filter på tidsstatus (Utförd/Avbokad)
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      where += ` AND shifts.status = $${params.length}`;
    }

    try {
      const baseQuery = `
        FROM shifts
        LEFT JOIN cases ON shifts.case_id = cases.id
        LEFT JOIN efforts ON cases.effort_id = efforts.id
        LEFT JOIN customers ON cases.customer_id = customers.id
        ${where}
      `;

      const [
        besokRes,
        kunderRes,
        tidRes,
        avbokRes,
        aktivaKunderRes,
        aktivaInsatserRes,
      ] = await Promise.all([
        pool.query(`SELECT COUNT(*) ${baseQuery}`, params),
        pool.query(`SELECT COUNT(DISTINCT cases.customer_id) ${baseQuery}`, params),
        pool.query(
          `SELECT COALESCE(SUM(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE 0 END), 0) AS total_hours ${baseQuery}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE shifts.status = 'Avbokad') AS avbok,
                  COUNT(*) AS total ${baseQuery}`,
          params
        ),
        pool.query(`SELECT COUNT(*) AS aktiva_kunder_total FROM customers WHERE active = TRUE`),
        pool.query(`SELECT COUNT(*) AS aktiva_insatser_total FROM cases WHERE active = TRUE`),
      ]);

      const antal_besok = Number(besokRes.rows[0].count) || 0;
      const antal_kunder = Number(kunderRes.rows[0].count) || 0;
      const totala_timmar = Number(tidRes.rows[0].total_hours) || 0;
      const avbokningar = Number(avbokRes.rows[0].avbok) || 0;
      const total = Number(avbokRes.rows[0].total) || 1;
      const avbokningsgrad = Math.round((avbokningar / total) * 100);
      const aktiva_kunder_total = Number(aktivaKunderRes.rows[0]?.aktiva_kunder_total) || 0;
      const aktiva_insatser_total = Number(aktivaInsatserRes.rows[0]?.aktiva_insatser_total) || 0;

      const customerFilters: string[] = ["active = TRUE"];
      const customerParams: any[] = [];
      if (from) {
        customerFilters.push(`created_at >= $${customerParams.length + 1}::date`);
        customerParams.push(String(from));
      }
      if (to) {
        customerFilters.push(`created_at <= $${customerParams.length + 1}::date`);
        customerParams.push(String(to));
      }
      const customerWhere = customerFilters.length ? `WHERE ${customerFilters.join(' AND ')}` : '';
      const customerCountRes = await pool.query(
        `SELECT COUNT(*) AS new_customers FROM customers ${customerWhere}`,
        customerParams
      );
      const newCustomers = Number(customerCountRes.rows[0]?.new_customers) || 0;

      const caseFilters: string[] = [];
      const caseParams: any[] = [];
      if (from) {
        caseFilters.push(`created_at >= $${caseParams.length + 1}::date`);
        caseParams.push(String(from));
      }
      if (to) {
        caseFilters.push(`created_at <= $${caseParams.length + 1}::date`);
        caseParams.push(String(to));
      }
      if (!includeInactiveBool) {
        caseFilters.push("active = TRUE");
      }
      const caseWhere = caseFilters.length ? `WHERE ${caseFilters.join(" AND ")}` : "";
      const caseCountRes = await pool.query(`SELECT COUNT(*) AS new_cases FROM cases ${caseWhere}`, caseParams);
      const newCases = Number(caseCountRes.rows[0]?.new_cases) || 0;

      const payload = {
        antal_besok,
        antal_kunder,
        totala_timmar,
        avbokningsgrad,
        aktiva_kunder_total,
        aktiva_insatser_total,
        ny_antal_kunder: newCustomers,
        ny_antal_insatser: newCases,
      };
      statsCache.set(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      console.error("Fel i /stats/summary:", err);
      res.status(500).json({ error: "Kunde inte hämta statistik" });
    }
  });

  router.get("/raw", sanitizeTextInputs, validateSearchParams, async (req, res) => {
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];

    if (from) {
      params.push(String(from));
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(String(to));
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    if (effortCategory) {
      const categories = String(effortCategory).split(",");
      const likeConditions = categories.map((_, index) => `efforts.available_for ILIKE $${params.length + index + 1}`).join(" OR ");
      where += ` AND (${likeConditions})`;
      params.push(...categories.map(cat => `%${cat.trim()}%`));
    }
    if (gender) {
      const genders = String(gender).split(",");
      where += ` AND customers.gender = ANY($${params.length + 1})`;
      params.push(genders);
    }
    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      where += ` AND customers.birth_year = ANY($${params.length + 1})`;
      params.push(years);
    }
    if (customer) {
      const customers = String(customer).split(",").map(Number);
      where += ` AND cases.customer_id = ANY($${params.length + 1})`;
      params.push(customers);
    }
    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      where += ` AND (cases.handler1_id = ANY($${params.length + 1}) OR cases.handler2_id = ANY($${params.length + 1}))`;
      params.push(handlers);
    }
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      where += ` AND shifts.status = $${params.length}`;
    }

    try {
      const result = await pool.query(
        `SELECT
           shifts.id AS shift_id,
           shifts.date,
           shifts.hours,
           shifts.status,
           cases.id AS case_id,
           cases.active AS case_active,
           efforts.id AS effort_id,
           efforts.name AS effort_name,
           efforts.available_for,
           customers.id AS customer_id,
           customers.initials AS customer_initials,
           customers.gender AS customer_gender,
           customers.birth_year AS customer_birth_year,
           customers.is_group AS customer_is_group,
           customers.is_protected AS customer_is_protected,
           customers.active AS customer_active,
           handler1.id AS handler1_id,
           handler1.name AS handler1_name,
           handler2.id AS handler2_id,
           handler2.name AS handler2_name
         FROM shifts
         LEFT JOIN cases ON shifts.case_id = cases.id
         LEFT JOIN efforts ON cases.effort_id = efforts.id
         LEFT JOIN customers ON cases.customer_id = customers.id
         LEFT JOIN handlers handler1 ON cases.handler1_id = handler1.id
         LEFT JOIN handlers handler2 ON cases.handler2_id = handler2.id
         ${where}
         ORDER BY shifts.date DESC, shifts.id DESC`,
        params
      );

      const viewerId = req.user?.id ?? 0;
      const viewerRole = req.user?.role ?? '';
      const roleLower = viewerRole.toLowerCase();
      const isAdmin = roleLower === 'admin';
      let assignedIds = new Set<number>();
      if (!isAdmin && viewerId) {
        const assigned = await pool.query(
          `SELECT DISTINCT customer_id FROM cases WHERE active = TRUE AND (handler1_id = $1 OR handler2_id = $1)`,
          [viewerId]
        );
        assignedIds = new Set(assigned.rows.map(r => Number(r.customer_id)));
      }

      const safeRows = result.rows.map(row => {
        const safeInitials = getSafeNameForCaseContext(
          {
            customer_id: Number(row.customer_id),
            customer_initials: row.customer_initials,
            is_protected: row.customer_is_protected,
            handler1_id: row.handler1_id,
            handler2_id: row.handler2_id,
          },
          { viewerId, viewerRole }
        );

        const canViewSensitive = !row.customer_is_protected || isAdmin || assignedIds.has(Number(row.customer_id));

        return {
          shift_id: Number(row.shift_id),
          date: row.date,
          hours: Number(row.hours) || 0,
          status: row.status,
          case_id: row.case_id ? Number(row.case_id) : null,
          case_active: row.case_active,
          effort_id: row.effort_id ? Number(row.effort_id) : null,
          effort_name: row.effort_name,
          effort_available_for: row.available_for,
          customer_id: row.customer_id ? Number(row.customer_id) : null,
          customer_initials: safeInitials,
          customer_gender: canViewSensitive ? row.customer_gender : null,
          customer_birth_year: canViewSensitive ? row.customer_birth_year : null,
          customer_is_group: row.customer_is_group,
          customer_active: row.customer_active,
          handler1_id: row.handler1_id ? Number(row.handler1_id) : null,
          handler1_name: row.handler1_name,
          handler2_id: row.handler2_id ? Number(row.handler2_id) : null,
          handler2_name: row.handler2_name,
        };
      });

      res.json(safeRows);
    } catch (err) {
      console.error('Error fetching raw stats:', err);
      res.status(500).json({ error: "Kunde inte hämta detaljerad statistik" });
    }
  });

  // Statistik: per insats
  router.get("/by-effort", async (req, res) => {
    const cacheKey = buildCacheKey('by-effort', req);
    const cached = statsCache.get(cacheKey);
    if (cached) return res.json(cached);
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];
    if (from) {
      params.push(String(from));
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(String(to));
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    if (effortCategory) {
      const categories = String(effortCategory).split(",");
      const likeConditions = categories.map((_, index) => 
        `efforts.available_for ILIKE $${params.length + index + 1}`
      ).join(" OR ");
      
      where += ` AND (${likeConditions})`;
      params.push(...categories.map(cat => `%${cat.trim()}%`));
    }
    if (gender) {
      const genders = String(gender).split(",");
      where += ` AND customers.gender = ANY($${params.length + 1})`;
      params.push(genders);
    }
    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      where += ` AND customers.birth_year = ANY($${params.length + 1})`;
      params.push(years);
    }
    if (customer) {
      const customers = String(customer).split(",").map(Number);
      where += ` AND cases.customer_id = ANY($${params.length + 1})`;
      params.push(customers);
    }
    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      where += ` AND (cases.handler1_id = ANY($${params.length + 1}) OR cases.handler2_id = ANY($${params.length + 1}))`;
      params.push(handlers);
    }
    // Aktiv/inaktiv
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }

    // Statusfilter
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      where += ` AND shifts.status = $${params.length}`;
    }

    try {
      const result = await pool.query(
        `SELECT efforts.id AS effort_id, efforts.name AS effort_name,
          COUNT(shifts.id) AS antal_besok,
          COALESCE(SUM(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE 0 END), 0) AS totala_timmar,
          COUNT(DISTINCT cases.customer_id) AS antal_kunder
        FROM cases
        LEFT JOIN shifts ON cases.id = shifts.case_id AND shifts.active = TRUE
        LEFT JOIN efforts ON cases.effort_id = efforts.id
        LEFT JOIN customers ON cases.customer_id = customers.id
        ${where}
        GROUP BY efforts.id, efforts.name
        ORDER BY efforts.name ASC`,
        params
      );
      statsCache.set(cacheKey, result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching by-effort stats:", err);
      res.status(500).json({ error: "Kunde inte hämta statistik per insats" });
    }
  });

  router.get("/by-gender", async (req, res) => {
    const cacheKey = buildCacheKey('by-gender', req);
    const cached = statsCache.get(cacheKey);
    if (cached) return res.json(cached);
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];

    if (from) {
      params.push(String(from));
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(String(to));
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    if (effortCategory) {
      const categories = String(effortCategory).split(",");
      const likeConditions = categories.map((_, index) => `efforts.available_for ILIKE $${params.length + index + 1}`).join(" OR ");
      where += ` AND (${likeConditions})`;
      params.push(...categories.map(cat => `%${cat.trim()}%`));
    }
    if (gender) {
      const genders = String(gender).split(",");
      where += ` AND customers.gender = ANY($${params.length + 1})`;
      params.push(genders);
    }
    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      where += ` AND customers.birth_year = ANY($${params.length + 1})`;
      params.push(years);
    }
    if (customer) {
      const customers = String(customer).split(",").map(Number);
      where += ` AND cases.customer_id = ANY($${params.length + 1})`;
      params.push(customers);
    }
    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      where += ` AND (cases.handler1_id = ANY($${params.length + 1}) OR cases.handler2_id = ANY($${params.length + 1}))`;
      params.push(handlers);
    }
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      where += ` AND shifts.status = $${params.length}`;
    }

    try {
      const result = await pool.query(
        `SELECT
           COALESCE(customers.gender, 'Okänd') AS gender,
           COUNT(shifts.id) AS antal_besok,
           COALESCE(SUM(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE 0 END), 0) AS totala_timmar,
           AVG(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE NULL END) AS snitt_timmar
         FROM shifts
         LEFT JOIN cases ON shifts.case_id = cases.id
         LEFT JOIN efforts ON cases.effort_id = efforts.id
         LEFT JOIN customers ON cases.customer_id = customers.id
         ${where}
         GROUP BY gender
         ORDER BY gender ASC`,
        params
      );

      const rows = result.rows.map(row => ({
        gender: row.gender,
        antal_besok: Number(row.antal_besok) || 0,
        totala_timmar: Number(row.totala_timmar) || 0,
        snitt_timmar: row.snitt_timmar ? Number(row.snitt_timmar) : 0,
      }));

      statsCache.set(cacheKey, rows);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching gender stats:', err);
      res.status(500).json({ error: "Kunde inte hämta statistik per kön" });
    }
  });

  router.get("/by-birthyear", async (req, res) => {
    const cacheKey = buildCacheKey('by-birthyear', req);
    const cached = statsCache.get(cacheKey);
    if (cached) return res.json(cached);
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];

    if (from) {
      params.push(String(from));
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(String(to));
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    if (effortCategory) {
      const categories = String(effortCategory).split(",");
      const likeConditions = categories.map((_, index) => `efforts.available_for ILIKE $${params.length + index + 1}`).join(" OR ");
      where += ` AND (${likeConditions})`;
      params.push(...categories.map(cat => `%${cat.trim()}%`));
    }
    if (gender) {
      const genders = String(gender).split(",");
      where += ` AND customers.gender = ANY($${params.length + 1})`;
      params.push(genders);
    }
    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      where += ` AND customers.birth_year = ANY($${params.length + 1})`;
      params.push(years);
    }
    if (customer) {
      const customers = String(customer).split(",").map(Number);
      where += ` AND cases.customer_id = ANY($${params.length + 1})`;
      params.push(customers);
    }
    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      where += ` AND (cases.handler1_id = ANY($${params.length + 1}) OR cases.handler2_id = ANY($${params.length + 1}))`;
      params.push(handlers);
    }
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      where += ` AND shifts.status = $${params.length}`;
    }

    try {
      const result = await pool.query(
        `SELECT
           COALESCE(customers.birth_year, 0) AS birth_year,
           COUNT(shifts.id) AS antal_besok,
           COUNT(DISTINCT customers.id) AS antal_kunder,
           COALESCE(SUM(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE 0 END), 0) AS totala_timmar,
           AVG(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE NULL END) AS snitt_timmar
         FROM shifts
         LEFT JOIN cases ON shifts.case_id = cases.id
         LEFT JOIN efforts ON cases.effort_id = efforts.id
         LEFT JOIN customers ON cases.customer_id = customers.id
         ${where}
         GROUP BY birth_year
         ORDER BY birth_year DESC`,
        params
      );

      const rows = result.rows.map(row => ({
        birth_year: Number(row.birth_year) || null,
        label: Number(row.birth_year) ? String(row.birth_year) : 'Okänt',
        antal_besok: Number(row.antal_besok) || 0,
        antal_kunder: Number(row.antal_kunder) || 0,
        totala_timmar: Number(row.totala_timmar) || 0,
        snitt_timmar: row.snitt_timmar ? Number(row.snitt_timmar) : 0,
      }));

      statsCache.set(cacheKey, rows);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching birth year stats:', err);
      res.status(500).json({ error: "Kunde inte hämta statistik per födelseår" });
    }
  });

  router.get("/cases", async (req, res) => {
    const { from, to, insats, effortCategory, gender, birthYear, customer, handler, includeInactive, shiftStatus } = req.query as any;

    const params: any[] = [];
    const addParam = (value: any) => {
      params.push(value);
      return `$${params.length}`;
    };

    const shiftConditions: string[] = ["s.active = TRUE"];

    if (from) {
      shiftConditions.push(`s.date >= ${addParam(String(from))}::date`);
    }
    if (to) {
      shiftConditions.push(`s.date <= ${addParam(String(to))}::date`);
    }
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      shiftConditions.push(`s.status = ${addParam(String(shiftStatus))}`);
    }

    const shiftWhereSql = shiftConditions.length ? `WHERE ${shiftConditions.join(' AND ')}` : '';

    const whereClauses: string[] = [];

    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        const placeholder = addParam(ids);
        whereClauses.push(`c.effort_id = ANY(${placeholder})`);
      } else {
        whereClauses.push(`c.effort_id = ${addParam(Number(parts[0]))}`);
      }
    }

    if (effortCategory) {
      const categories = String(effortCategory).split(",").map(cat => cat.trim()).filter(Boolean);
      if (categories.length > 0) {
        const likeParts = categories.map(cat => `e.available_for ILIKE ${addParam(`%${cat}%`)}`);
        whereClauses.push(`(${likeParts.join(' OR ')})`);
      }
    }

    if (gender) {
      const genders = String(gender).split(",");
      const placeholder = addParam(genders);
      whereClauses.push(`cust.gender = ANY(${placeholder})`);
    }

    if (birthYear) {
      const years = String(birthYear).split(",").map(Number);
      const placeholder = addParam(years);
      whereClauses.push(`cust.birth_year = ANY(${placeholder})`);
    }

    if (customer) {
      const customers = String(customer).split(",").map(Number);
      const placeholder = addParam(customers);
      whereClauses.push(`c.customer_id = ANY(${placeholder})`);
    }

    if (handler) {
      const handlers = String(handler).split(",").map(Number);
      const placeholder = addParam(handlers);
      whereClauses.push(`(c.handler1_id = ANY(${placeholder}) OR c.handler2_id = ANY(${placeholder}))`);
    }

    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      whereClauses.push('(c.active = TRUE AND e.active = TRUE AND cust.active = TRUE)');
    }
    const requireShifts = shiftStatus !== 'Avbokad';

    try {
      const sql = `WITH filtered_shifts AS (
           SELECT s.*
           FROM shifts s
           ${shiftWhereSql}
         )
         SELECT
           c.id AS case_id,
           c.active AS case_active,
           c.created_at,
           e.id AS effort_id,
           e.name AS effort_name,
           e.available_for,
           cust.id AS customer_id,
           cust.initials AS customer_initials,
           cust.gender AS customer_gender,
           cust.birth_year AS customer_birth_year,
           cust.is_group AS customer_is_group,
           cust.is_protected AS customer_is_protected,
           cust.active AS customer_active,
           h1.id AS handler1_id,
           h1.name AS handler1_name,
           h2.id AS handler2_id,
           h2.name AS handler2_name,
           COALESCE(COUNT(fs.id) FILTER (WHERE fs.status = 'Utförd'), 0) AS antal_besok,
           COALESCE(SUM(CASE WHEN fs.status = 'Utförd' THEN fs.hours ELSE 0 END), 0) AS totala_timmar,
           COALESCE(COUNT(fs.id) FILTER (WHERE fs.status = 'Avbokad'), 0) AS avbokade_besok
         FROM cases c
         LEFT JOIN efforts e ON c.effort_id = e.id
         LEFT JOIN customers cust ON c.customer_id = cust.id
         LEFT JOIN handlers h1 ON c.handler1_id = h1.id
         LEFT JOIN handlers h2 ON c.handler2_id = h2.id
         LEFT JOIN filtered_shifts fs ON fs.case_id = c.id
         ${whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''}
         GROUP BY
           c.id,
           e.id,
           cust.id,
           h1.id,
           h2.id
         HAVING ${requireShifts ? 'COUNT(fs.id) FILTER (WHERE fs.status = \'Utförd\') > 0' : 'TRUE'}
         ORDER BY c.id DESC`;

      const result = await pool.query(sql, params);

      const viewerId = req.user?.id ?? 0;
      const viewerRole = req.user?.role ?? '';
      const isAdmin = viewerRole?.toLowerCase() === 'admin';
      let assignedIds = new Set<number>();
      if (!isAdmin && viewerId) {
        const assigned = await pool.query(
          `SELECT DISTINCT customer_id FROM cases WHERE active = TRUE AND (handler1_id = $1 OR handler2_id = $1)`,
          [viewerId]
        );
        assignedIds = new Set(assigned.rows.map(r => Number(r.customer_id)));
      }

      const rows = result.rows.map(row => {
        const safeInitials = getSafeNameForCaseContext(
          {
            customer_id: Number(row.customer_id),
            customer_initials: row.customer_initials,
            is_protected: row.customer_is_protected,
            handler1_id: row.handler1_id,
            handler2_id: row.handler2_id,
          },
          { viewerId, viewerRole }
        );

        const canViewSensitive = !row.customer_is_protected || isAdmin || assignedIds.has(Number(row.customer_id));

        return {
          case_id: Number(row.case_id),
          case_active: row.case_active,
          created_at: row.created_at,
          effort_id: row.effort_id ? Number(row.effort_id) : null,
          effort_name: row.effort_name,
          effort_available_for: row.available_for,
          customer_id: row.customer_id ? Number(row.customer_id) : null,
          customer_initials: safeInitials,
          customer_gender: canViewSensitive ? row.customer_gender : null,
          customer_birth_year: canViewSensitive ? row.customer_birth_year : null,
          customer_is_group: row.customer_is_group,
          customer_active: row.customer_active,
          handler1_id: row.handler1_id ? Number(row.handler1_id) : null,
          handler1_name: row.handler1_name,
          handler2_id: row.handler2_id ? Number(row.handler2_id) : null,
          handler2_name: row.handler2_name,
          antal_besok: Number(row.antal_besok) || 0,
          totala_timmar: Number(row.totala_timmar) || 0,
          avbokade_besok: Number(row.avbokade_besok) || 0,
        };
      });

      res.json(rows);
    } catch (err) {
      console.error('Error fetching case stats:', err);
      res.status(500).json({ error: "Kunde inte hämta insats" });
    }
  });

  // Statistik: per månad
  router.get("/by-month", async (req, res) => {
    const { from, to, insats, includeInactive } = req.query as any;
    // Basera på skiftens datum och aktiva skift
    let where = "WHERE shifts.active = TRUE";
    const params: any[] = [];
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      where += " AND (cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)";
    }
    if (from) {
      params.push(from);
      where += ` AND shifts.date >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND shifts.date <= $${params.length}::date`;
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        where += ` AND cases.effort_id = ANY($${params.length + 1})`;
        params.push(ids);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        where += ` AND cases.effort_id = $${params.length}`;
      }
    }
    try {
      const result = await pool.query(
        `SELECT EXTRACT(YEAR FROM shifts.date) AS year, EXTRACT(MONTH FROM shifts.date) AS month,
          COUNT(shifts.id) AS antal_besok,
          COALESCE(SUM(CASE WHEN shifts.status = 'Utförd' THEN shifts.hours ELSE 0 END), 0) AS totala_timmar,
          COUNT(DISTINCT cases.customer_id) AS antal_kunder
        FROM shifts
        LEFT JOIN cases ON shifts.case_id = cases.id
        LEFT JOIN efforts ON cases.effort_id = efforts.id
        LEFT JOIN customers ON cases.customer_id = customers.id
        ${where}
        GROUP BY year, month
        ORDER BY year, month`,
        params
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching by-month stats:", err);
      res.status(500).json({ error: "Kunde inte hämta statistik per månad" });
    }
  });

  // Statistik: per behandlare
  router.get("/by-handler", async (req, res) => {
    const cacheKey = buildCacheKey('by-handler', req);
    const cached = statsCache.get(cacheKey);
    if (cached) return res.json(cached);
    const { from, to, insats, includeInactive, shiftStatus } = req.query as any;
    const params: any[] = [];

    const filters: string[] = ["shifts.active = TRUE"];
    const includeInactiveBool = String(includeInactive) === 'true';
    if (!includeInactiveBool) {
      filters.push("(cases.active = TRUE AND efforts.active = TRUE AND customers.active = TRUE)");
    }
    if (from) {
      params.push(String(from));
      filters.push(`shifts.date >= $${params.length}::date`);
    }
    if (to) {
      params.push(String(to));
      filters.push(`shifts.date <= $${params.length}::date`);
    }
    if (insats && insats !== "alla") {
      const parts = String(insats).split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const ids = parts.map(Number).filter(n => !isNaN(n));
        params.push(ids);
        filters.push(`cases.effort_id = ANY($${params.length})`);
      } else {
        const id = Number(parts[0]);
        params.push(id);
        filters.push(`cases.effort_id = $${params.length}`);
      }
    }
    if (shiftStatus && shiftStatus !== 'Alla' && shiftStatus !== 'alla') {
      params.push(String(shiftStatus));
      filters.push(`shifts.status = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
      const result = await pool.query(
        `WITH handler_shifts AS (
          SELECT
            shifts.id,
            shifts.date,
            shifts.hours,
            shifts.status,
            cases.handler1_id,
            cases.handler2_id
          FROM shifts
          LEFT JOIN cases ON shifts.case_id = cases.id
          LEFT JOIN efforts ON cases.effort_id = efforts.id
          LEFT JOIN customers ON cases.customer_id = customers.id
          ${whereClause}
        )
        SELECT
          h.id AS handler_id,
          h.name AS handler_name,
          COUNT(handler_shifts.id) AS antal_besok,
          COALESCE(SUM(CASE WHEN handler_shifts.status = 'Utförd' THEN handler_shifts.hours ELSE 0 END), 0) AS totala_timmar
        FROM handler_shifts
        CROSS JOIN LATERAL (VALUES (handler_shifts.handler1_id), (handler_shifts.handler2_id)) handler_ids(handler_id)
        JOIN handlers h ON h.id = handler_ids.handler_id
        WHERE handler_ids.handler_id IS NOT NULL
        GROUP BY h.id, h.name
        ORDER BY h.name ASC`,
        params
      );
      statsCache.set(cacheKey, result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching by-handler stats:", err);
      res.status(500).json({ error: "Kunde inte hämta statistik per behandlare" });
    }
  });

  return router;
}
