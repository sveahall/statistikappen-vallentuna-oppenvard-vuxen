import { Router, Request, Response } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import { authenticateToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { TOO_MANY_REQUESTS_RESPONSE, rateLimitKeyGenerator } from "../middleware/rateLimit";
import { validatePassword, validateName } from "../middleware/validation";
import { config } from "../config";
import { getAuditLogger } from "../utils/auditLogger";
// emailService borttagen - e-post skickas manuellt

// Rate limiting för invite-accept
const acceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuter
  max: 5, // 5 försök per IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: rateLimitKeyGenerator,
  message: TOO_MANY_REQUESTS_RESPONSE,
});

const getRequestContext = (req: Request) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown';
  return { ip, userAgent };
};

export default function invites(pool: Pool) {
  const router = Router();
  const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const auditLogger = getAuditLogger(pool);

  const logInviteEvent = async (
    inviteId: number,
    action: string,
    options: { performedBy?: number; details?: unknown } = {}
  ) => {
    if (!inviteId || !action) return;

    const { performedBy, details } = options;
    const query = performedBy != null
      ? 'INSERT INTO invite_audit_log (invite_id, action, performed_by, details) VALUES ($1, $2, $3, $4)'
      : 'INSERT INTO invite_audit_log (invite_id, action, details) VALUES ($1, $2, $3)';

    const values = performedBy != null
      ? [inviteId, action, performedBy, details ?? null]
      : [inviteId, action, details ?? null];

    try {
      await pool.query(query, values);
    } catch (error) {
      console.warn('⚠️  Invite audit log misslyckades (fortsätter ändå):', (error as any)?.message || error);
    }
  };

  // Skapa ny invite (endast admin)
  router.post("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    const { email, role = 'handler' } = req.body;
    const adminId = (req.user as any).id;

    if (!email || !role) {
      return res.status(400).json({ error: "Email och roll krävs" });
    }

    // Validera e-postadress
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Ogiltig e-postadress" });
    }

    // Validera roll
    if (!['handler', 'admin'].includes(role)) {
      return res.status(400).json({ error: "Ogiltig roll. Måste vara 'handler' eller 'admin'" });
    }

    try {
      // Kontrollera om e-postadressen redan finns
      const existingUser = await pool.query(
        'SELECT id FROM handlers WHERE email = $1 AND active = true',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: "En användare med denna e-postadress finns redan" });
      }

      // Kontrollera om det redan finns en aktiv invite för denna e-post
      const existingInvite = await pool.query(
        'SELECT id FROM invites WHERE email = $1 AND status = $2 AND expires_at > NOW()',
        [email, 'pending']
      );

      if (existingInvite.rows.length > 0) {
        return res.status(400).json({ error: "En aktiv inbjudan för denna e-postadress finns redan" });
      }

      // Generera säker token och verifieringskod
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const verificationCode = crypto.randomBytes(6).toString('hex').toUpperCase();
      
      // Sätt utgångstid (7 dagar) för både länk och verifieringskod
      const expiresInMs = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + expiresInMs);
      const verificationExpiresAt = new Date(expiresAt);

      // Skapa invite
      const result = await pool.query(
        `INSERT INTO invites (
          email, role, token, token_hash, expires_at, created_by, 
          verification_code, verification_expires_at, status
        ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [email, role, tokenHash, expiresAt, adminId, verificationCode, verificationExpiresAt, 'pending']
      );

      const inviteId = result.rows[0].id;

      // Logga att invite skapades (en gång)
      await logInviteEvent(inviteId, 'created', {
        performedBy: adminId,
        details: { email, role, expires_at: expiresAt, created_at: new Date() },
      });
      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'INVITE_CREATED',
          entityType: 'invite',
          entityId: inviteId,
          entityName: email,
          details: { email, role, expires_at: expiresAt },
          ipAddress: ip,
          userAgent,
        });
      }

      // Returnera data för admin
      const frontendBase = config.frontend.url.replace(/\/$/, '');

      res.status(201).json({ 
        id: inviteId,
        email,
        role,
        token,
        verification_code: verificationCode,
        invite_url: `${frontendBase}/invite/${token}`,
        expires_at: expiresAt,
        message: 'Inbjudan skapad! Skicka länk och verifieringskod manuellt till användaren.'
      });

    } catch (error) {
      console.error('Error creating invite:', error);
      res.status(500).json({ error: "Kunde inte skapa inbjudan" });
    }
  });

  // Verifiera e-postadress med kod
  router.post(
    "/verify-email",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      keyGenerator: rateLimitKeyGenerator,
      message: TOO_MANY_REQUESTS_RESPONSE,
    }),
    async (req: Request, res: Response) => {
    const { email, verification_code } = req.body;

    if (!email || !verification_code) {
      return res.status(400).json({ error: "Email och verifieringskod krävs" });
    }

    try {
      const result = await pool.query(
        'SELECT id, verification_code, verification_expires_at FROM invites WHERE email = $1 AND status = $2',
        [email, 'pending']
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: "Ingen aktiv inbjudan hittad för denna e-postadress" });
      }

      const invite = result.rows[0];

      if (invite.verification_code !== verification_code.toUpperCase()) {
        return res.status(400).json({ error: "Fel verifieringskod" });
      }

      if (new Date(invite.verification_expires_at) < new Date()) {
        return res.status(400).json({ error: "Verifieringskoden har gått ut" });
      }

      // Markera e-post som verifierad
      await pool.query(
        'UPDATE invites SET email_verified = true WHERE id = $1',
        [invite.id]
      );

      // Logga verifiering
      await logInviteEvent(invite.id, 'verified', {
        details: { verified_at: new Date() },
      });

      res.json({ 
        message: 'E-postadress verifierad',
        invite_id: invite.id
      });

    } catch (error) {
      console.error('Error verifying email:', error);
      res.status(500).json({ error: "Kunde inte verifiera e-postadress" });
    }
  });

  // Acceptera invite och skapa användare
  router.post("/accept", acceptLimiter, async (req: Request, res: Response) => {
    const { token, password, name } = req.body;

    if (!token || !password || !name) {
      return res.status(400).json({ error: "Token, lösenord och namn krävs" });
    }

    // Validera namn
    if (!validateName(name)) {
      return res.status(400).json({ error: "Ogiltigt namn. Använd endast bokstäver, mellanslag och bindestreck (2-100 tecken)" });
    }

    // Validera lösenord (samma krav som övriga endpoints)
    if (!validatePassword(password)) {
      return res.status(400).json({ error: "Lösenord måste vara minst 8 tecken med minst en bokstav och en siffra" });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
      // Hitta invite
      const inviteResult = await pool.query(
        'SELECT * FROM invites WHERE token_hash = $1 AND status = $2',
        [tokenHash, 'pending']
      );

      if (inviteResult.rows.length === 0) {
        return res.status(400).json({ error: "Ogiltig eller utgången inbjudan" });
      }

      const invite = inviteResult.rows[0];

      // Kontrollera om invite har gått ut
      if (new Date(invite.expires_at) < new Date()) {
        await pool.query(
          'UPDATE invites SET status = $1 WHERE id = $2',
          ['expired', invite.id]
        );
        return res.status(400).json({ error: "Inbjudan har gått ut" });
      }

      // Kontrollera om e-post är verifierad
      if (!invite.email_verified) {
        return res.status(400).json({ error: "E-postadressen måste verifieras först" });
      }

      // Hasha lösenord med bcrypt
      const hashedPassword = await bcrypt.hash(password, ROUNDS);

      // Skapa användare
      const userResult = await pool.query(
        `INSERT INTO handlers (name, email, password_hash, role, active) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, invite.email, hashedPassword, invite.role, true]
      );

      const userId = userResult.rows[0].id;

      // Uppdatera invite-status
      await pool.query(
        'UPDATE invites SET status = $1, used_at = NOW(), token = NULL, verification_code = NULL WHERE id = $2',
        ['accepted', invite.id]
      );

      // Logga accept
      await logInviteEvent(invite.id, 'accepted', {
        performedBy: userId,
        details: { user_id: userId, accepted_at: new Date() },
      });

      // Välkomst-e-post skickas manuellt

      // Logga att användare skapades
      await logInviteEvent(invite.id, 'user_created', {
        performedBy: userId,
        details: { user_id: userId, created_at: new Date() },
      });

      res.json({ 
        message: 'Konto skapat framgångsrikt! Skicka välkomstmeddelande manuellt till användaren.',
        user_id: userId,
        email: invite.email,
        role: invite.role
      });

    } catch (error) {
      console.error('Error accepting invite:', error);
      res.status(500).json({ error: "Kunde inte acceptera inbjudan" });
    }
  });

  // Hämta alla invites (endast admin)
  router.get("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT 
            i.id,
            i.email,
            i.role,
            i.status,
            i.created_at,
            i.expires_at,
            i.created_by,
            i.token,
            i.verification_code,
            i.verification_expires_at,
            i.email_verified,
            h.name AS created_by_name
         FROM invites i
         LEFT JOIN handlers h ON i.created_by = h.id
         ORDER BY i.created_at DESC`
      );

      const invites = result.rows.map(row => {
        const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
        let statusDisplay = 'Okänd';

        if (row.status === 'pending') {
          if (expiresAt && expiresAt <= new Date()) {
            statusDisplay = 'Utgången';
          } else {
            statusDisplay = 'Aktiv';
          }
        } else if (row.status === 'accepted') {
          statusDisplay = 'Accepterad';
        } else if (row.status === 'cancelled') {
          statusDisplay = 'Avbruten';
        }

        return {
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          status_display: statusDisplay,
          created_at: row.created_at,
          expires_at: row.expires_at,
          created_by: row.created_by,
          created_by_name: row.created_by_name,
          token: null,
          verification_code: null,
          verification_expires_at: row.verification_expires_at,
          email_verified: row.email_verified,
          invite_url: null,
        };
      });

      res.json(invites);
    } catch (error) {
      console.error('Error fetching invites:', error);
      res.status(500).json({ error: "Kunde inte hämta inbjudningar" });
    }
  });

  router.post('/:id/regenerate', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req.user as any).id;

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const verificationCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const expiresInMs = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiresInMs);
    const verificationExpiresAt = new Date(expiresAt);

    try {
      const result = await pool.query(
        `UPDATE invites
         SET token = NULL,
             token_hash = $1,
             verification_code = $2,
             verification_expires_at = $3,
             expires_at = $4,
             status = 'pending',
             email_verified = false,
             used_at = NULL
         WHERE id = $5 AND status IN ('pending', 'expired')
         RETURNING id, email, role, created_by`,
        [tokenHash, verificationCode, verificationExpiresAt, expiresAt, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Inbjudan hittades inte eller kan inte återställas' });
      }

      const invite = result.rows[0];

      await logInviteEvent(Number(id), 'regenerated', {
        performedBy: adminId,
        details: { regenerated_at: new Date(), performed_by: adminId },
      });
      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'INVITE_REGENERATED',
          entityType: 'invite',
          entityId: Number(id),
          entityName: invite.email,
          details: { email: invite.email, role: invite.role, regenerated_at: new Date() },
          ipAddress: ip,
          userAgent,
        });
      }

      const frontendBase = config.frontend.url.replace(/\/$/, '');

      res.json({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token,
        verification_code: verificationCode,
        invite_url: `${frontendBase}/invite/${token}`,
        expires_at: expiresAt,
      });
    } catch (error) {
      console.error('Error regenerating invite:', error);
      res.status(500).json({ error: 'Kunde inte uppdatera inbjudan' });
    }
  });

  // Avbryt (soft delete) invite
  router.post("/:id/cancel", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req.user as any).id;

    try {
      const result = await pool.query(
        `UPDATE invites
         SET status = 'cancelled',
             token = NULL,
             token_hash = NULL,
             verification_code = NULL,
             verification_expires_at = NULL,
             expires_at = COALESCE(expires_at, NOW())
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Inbjudan hittades inte eller kan inte avbrytas" });
      }

      // Logga avbrott
      await logInviteEvent(Number(id), 'cancelled', {
        performedBy: adminId,
        details: { cancelled_at: new Date() },
      });
      if (req.user && result.rows[0]) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'INVITE_CANCELLED',
          entityType: 'invite',
          entityId: Number(id),
          entityName: String(id),
          details: { cancelled_at: new Date() },
          ipAddress: ip,
          userAgent,
        });
      }

      res.json({ message: 'Inbjudan avbruten' });

    } catch (error) {
      console.error('Error cancelling invite:', error);
      res.status(500).json({ error: "Kunde inte avbryta inbjudan" });
    }
  });

  // Ta bort invite permanent (endast admin)
  router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = (req.user as any).id;

    try {
      const result = await pool.query(
        `DELETE FROM invites
         WHERE id = $1 AND status IN ('cancelled', 'expired')
         RETURNING id, status`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Inbjudan hittades inte eller kan inte tas bort (avbryt först)' });
      }

      await logInviteEvent(Number(id), 'deleted', {
        performedBy: adminId,
        details: { deleted_at: new Date(), status: result.rows[0].status },
      });
      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'INVITE_DELETED',
          entityType: 'invite',
          entityId: Number(id),
          entityName: String(id),
          details: { status: result.rows[0]?.status, deleted_at: new Date() },
          ipAddress: ip,
          userAgent,
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting invite:', error);
      res.status(500).json({ error: 'Kunde inte ta bort inbjudan' });
    }
  });

  router.post('/cleanup/expired', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `DELETE FROM invites
         WHERE status = 'pending' AND expires_at <= NOW()
         RETURNING id`
      );

      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'INVITE_CLEANUP_EXPIRED',
          entityType: 'invite',
          details: { removed: result.rowCount },
          ipAddress: ip,
          userAgent,
        });
      }

      res.json({ removed: result.rowCount });
    } catch (error) {
      console.error('Error cleaning up invites:', error);
      res.status(500).json({ error: 'Kunde inte rensa inbjudningar' });
    }
  });



  return router;
}
