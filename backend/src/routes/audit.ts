import { Router } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { getAuditLogger } from "../utils/auditLogger";

const isMissingAuditTable = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return code === '42P01';
};

export default function audit(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);
  router.use(requireRole('admin'));

  // Hämta alla audit loggar med filtrering
  router.get("/", async (req, res) => {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      entityType, 
      username, 
      from, 
      to,
      search 
    } = req.query;

    try {
      let where = "WHERE 1=1";
      const params: any[] = [];
      let paramIndex = 1;

      // Filtrera på action
      if (action) {
        where += ` AND action = $${paramIndex}`;
        params.push(String(action));
        paramIndex++;
      }

      // Filtrera på entity type
      if (entityType) {
        where += ` AND entity_type = $${paramIndex}`;
        params.push(String(entityType));
        paramIndex++;
      }

      // Filtrera på användare
      if (username) {
        where += ` AND username ILIKE $${paramIndex}`;
        params.push(`%${String(username)}%`);
        paramIndex++;
      }

      // Filtrera på datum
      if (from) {
        where += ` AND created_at >= $${paramIndex}::timestamp`;
        params.push(String(from));
        paramIndex++;
      }

      if (to) {
        where += ` AND created_at <= $${paramIndex}::timestamp`;
        params.push(String(to));
        paramIndex++;
      }

      // Sök i alla textfält
      if (search) {
        where += ` AND (
          username ILIKE $${paramIndex} OR 
          action ILIKE $${paramIndex} OR 
          entity_type ILIKE $${paramIndex} OR 
          entity_name ILIKE $${paramIndex} OR
          details::text ILIKE $${paramIndex}
        )`;
        params.push(`%${String(search)}%`);
        paramIndex++;
      }

      // Räkna totalt antal loggar
      const countQuery = `SELECT COUNT(*) FROM audit_log ${where}`;
      const countResult = await pool.query(countQuery, params);
      const totalLogs = parseInt(countResult.rows[0].count);

      // Hämta loggar med paginering
      const offset = (Number(page) - 1) * Number(limit);
      const logsQuery = `
        SELECT 
          id, user_id, username, action, entity_type, entity_id, 
          entity_name, details, ip_address, user_agent, created_at
        FROM audit_log 
        ${where}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      params.push(Number(limit), offset);
      const logsResult = await pool.query(logsQuery, params);

      res.json({
        logs: logsResult.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalLogs,
          pages: Math.ceil(totalLogs / Number(limit))
        }
      });
    } catch (err) {
      if (isMissingAuditTable(err)) {
        console.warn('⚠️  audit_log-tabell saknas – returnerar tom lista (ingen audit-loggning ännu).');
        return res.json({
          logs: [],
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: 0,
            pages: 0,
          },
        });
      }

      console.error("Fel vid hämtning av audit log:", err);
      res.status(500).json({ error: "Kunde inte hämta audit log" });
    }
  });

  // Hämta statistik för audit log
  router.get("/stats", async (req, res) => {
    try {
      // Antal loggar per dag senaste 30 dagarna
      const dailyStats = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM audit_log 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      // Antal loggar per action
      const actionStats = await pool.query(`
        SELECT 
          action,
          COUNT(*) as count
        FROM audit_log 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY action
        ORDER BY count DESC
      `);

      // Antal loggar per användare
      const userStats = await pool.query(`
        SELECT 
          username,
          COUNT(*) as count
        FROM audit_log 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `);

      res.json({
        daily: dailyStats.rows,
        actions: actionStats.rows,
        users: userStats.rows
      });
    } catch (err) {
      if (isMissingAuditTable(err)) {
        console.warn('⚠️  audit_log-tabell saknas – returnerar tom statistik (ingen audit-loggning ännu).');
        return res.json({ daily: [], actions: [], users: [] });
      }

      console.error("Fel vid hämtning av audit statistik:", err);
      res.status(500).json({ error: "Kunde inte hämta audit statistik" });
    }
  });

  // Logga export (adminkrav p.g.a. globalt requireRole ovan)
  router.post("/export", async (req, res) => {
    try {
      const user = req.user!;
      const payload = req.body || {};
      const exportType = payload.entityName || payload.export_type || 'EXPORT';
      const details = payload.details || payload;
      const audit = getAuditLogger();
      await audit.logExport(user.id, user.name, exportType, details);
      return res.status(204).send();
    } catch (err) {
      console.error('Fel vid export-loggning:', err);
      return res.status(500).json({ error: 'Kunde inte logga export' });
    }
  });

  // Rensa gamla loggar (endast admin)
  router.post("/cleanup", async (req, res) => {
    try {
      const result = await pool.query("SELECT cleanup_old_audit_logs()");
      res.json({ message: "Gamla loggar rensade", result: result.rows[0] });
    } catch (err) {
      console.error("Fel vid rensning av gamla loggar:", err);
      res.status(500).json({ error: "Kunde inte rensa gamla loggar" });
    }
  });

  return router;
}
