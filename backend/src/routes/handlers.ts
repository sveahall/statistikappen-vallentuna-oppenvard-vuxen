import { Router, Request } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { validateEmail, validateName } from "../middleware/validation";
import crypto from "crypto";
import { getAuditLogger } from "../utils/auditLogger";
import { config } from "../config";

const getRequestContext = (req: Request) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown';
  return { ip, userAgent };
};

export default function handlers(pool: Pool) {
  const router = Router();
  const auditLogger = getAuditLogger(pool);
  
  // Public endpoint: Get a limited list of handlers (for all authenticated users)
  // This endpoint will return only ID and name, and will not require 'admin' role.
  router.get('/public', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT id, name FROM handlers WHERE active = TRUE ORDER BY name');
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching public handlers list:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Admin-only endpoints
  router.use(authenticateToken, requireRole("admin"));

  // Hämta alla behandlare (med stöd för all=true)
  router.get("/", async (req, res) => {
    try {
      const baseSelect = `
        SELECT id, name, email, role, active
        FROM handlers
      `;
      const sql = req.query.all === "true"
        ? `${baseSelect} ORDER BY name ASC`
        : `${baseSelect} WHERE active = TRUE ORDER BY name ASC`;
      const result = await pool.query(sql);
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: "Kunde inte hämta behandlare" });
    }
  });

  // Återaktivera behandlare
  router.put("/:id/activate", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE handlers SET active = TRUE WHERE id = $1 RETURNING *",
        [id]
      );
      if (req.user && result.rows[0]) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'USER_ACTIVATED',
          entityType: 'user',
          entityId: result.rows[0].id,
          entityName: result.rows[0].email,
          details: { active: true },
          ipAddress: ip,
          userAgent,
        });
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte återaktivera behandlare" });
    }
  });

  // Avaktivera behandlare
  router.put("/:id/deactivate", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE handlers SET active = FALSE WHERE id = $1 RETURNING *",
        [id]
      );
      if (req.user && result.rows[0]) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'USER_DEACTIVATED',
          entityType: 'user',
          entityId: result.rows[0].id,
          entityName: result.rows[0].email,
          details: { active: false },
          ipAddress: ip,
          userAgent,
        });
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte avaktivera behandlare" });
    }
  });

  // Skapa behandlare - DENNA FUNKTION ÄR INAKTIVERAD
  // Behandlare skapas endast via invite-systemet för säkerhet
  router.post("/", async (req, res) => {
    res.status(403).json({ 
      error: "Behandlare kan inte skapas direkt. Använd invite-systemet istället.",
      message: "Gå till Admin > Behandlare och skapa en inbjudan."
    });
  });

  // Uppdatera behandlare
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Namn och mail krävs" });
    }
    if (!validateName(name)) {
      return res.status(400).json({ error: "Ogiltigt namn. Använd endast bokstäver, mellanslag och bindestreck (2-100 tecken)" });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Ogiltigt email-format" });
    }
    try {
      const result = await pool.query(
        "UPDATE handlers SET name = $1, email = $2 WHERE id = $3 RETURNING *",
        [name, email, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Behandlare hittades inte" });
      }
      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: result.rows[0].id,
          entityName: result.rows[0].email,
          details: { name: result.rows[0].name, email: result.rows[0].email },
          ipAddress: ip,
          userAgent,
        });
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte uppdatera behandlare" });
    }
  });

  // Ingen hårdradering av behandlare – använd avaktivera istället
  router.delete("/:id", async (_req, res) => {
    return res.status(405).json({ error: 'Method Not Allowed: hård radering är avstängd. Använd avaktivera/återaktivera.' });
  });

  // Generera lösenordsåterställningslänk för behandlare
  router.post("/:id/generate-reset-link", async (req, res) => {
    try {
      const handlerId = parseInt(req.params.id);
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ 
          error: 'validation_error',
          message: 'E-postadress krävs' 
        });
      }

      // Hitta behandlaren
      const handlerResult = await pool.query(
        'SELECT id, email, name FROM handlers WHERE id = $1 AND email = $2',
        [handlerId, email]
      );

      if (handlerResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'handler_not_found',
          message: 'Behandlare hittades inte' 
        });
      }

      const handler = handlerResult.rows[0];

      // Rensa gamla tokens för denna behandlare
      await pool.query(
        'DELETE FROM password_resets WHERE user_id = $1',
        [handlerId]
      );

      // Generera ny token
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 timme

      // Spara i password_resets tabellen
      await pool.query(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [handlerId, hashedToken, expiresAt]
      );

      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'PASSWORD_RESET_LINK_CREATED',
          entityType: 'user',
          entityId: handler.id,
          entityName: handler.email,
          details: { handler_id: handler.id },
          ipAddress: ip,
          userAgent,
        });
      }

      // Returnera fullständig URL (token visas aldrig separat)
      const frontendBase = config.frontend.url.replace(/\/$/, '');
      res.json({
        message: 'Återställningslänk genererad',
        resetUrl: `${frontendBase}/reset-password/${token}`,
        expiresAt,
        handler: {
          id: handler.id,
          email: handler.email,
          name: handler.name
        }
      });

    } catch (error) {
      console.error('Fel vid generering av återställningslänk:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ 
        error: 'internal_error',
        message: 'Ett internt fel uppstod' 
      });
    }
  });

  return router;
}
