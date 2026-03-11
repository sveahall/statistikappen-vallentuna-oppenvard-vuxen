import { Router, Request, Response } from "express";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticateToken } from "../middleware/auth";
import { loginIpLimiter, loginLimiter } from "../middleware/rateLimit";
import { validateUserRegistration, sanitizeTextInputs } from "../middleware/validation";
import { getAuditLogger } from "../utils/auditLogger";
import { config } from "../config";

const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const getRequestContext = (req: Request) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown';
  return { ip, userAgent };
};

const respondAccountLocked = (res: Response, lockedUntil: Date) => {
  const retryAfterSeconds = Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  return res.status(429).json({
    error: 'account_locked',
    message: `Kontot är tillfälligt låst på grund av för många misslyckade försök. Försök igen om ${retryAfterMinutes} ${retryAfterMinutes === 1 ? 'minut' : 'minuter'}.`,
    retryAfterSeconds,
  });
};

const users = (pool: Pool) => {
  const router = Router();
  const auditLogger = getAuditLogger(pool);

  // Login endpoint med rate limiting och bruteforce-skydd
  router.post('/login', loginIpLimiter, loginLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const { ip, userAgent } = getRequestContext(req);
      if (!email || !password) {
        return res.status(400).json({ error: 'Email och lösenord krävs' });
      }

      // Hämta användare från databas
      const result = await pool.query(
        'SELECT id, name, email, role, password_hash, failed_login_attempts, locked_until FROM handlers WHERE email = $1 AND active = true',
        [email]
      );

      if (result.rows.length === 0) {
        await auditLogger.log({
          username: String(email),
          action: 'LOGIN_FAILED',
          entityType: 'user',
          entityName: String(email),
          details: { reason: 'user_not_found' },
          ipAddress: ip,
          userAgent,
        });
        return res.status(401).json({ error: 'Ogiltiga inloggningsuppgifter' });
      }

      const user = result.rows[0];
      const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
      if (lockedUntil && lockedUntil.getTime() > Date.now()) {
        await auditLogger.log({
          userId: user.id,
          username: user.name,
          action: 'LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          entityName: user.email,
          details: { reason: 'account_locked', locked_until: lockedUntil },
          ipAddress: ip,
          userAgent,
        });
        return respondAccountLocked(res, lockedUntil);
      }

      // Kontrollera lösenord med bcrypt
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        // Atomär uppdatering för att förhindra race conditions vid parallella requests
        const lockoutResult = await pool.query(
          `UPDATE handlers
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE
                 WHEN failed_login_attempts + 1 >= $1
                 THEN NOW() + ($2 || ' minutes')::interval
                 ELSE locked_until
               END
           WHERE id = $3
           RETURNING failed_login_attempts, locked_until`,
          [config.security.login.maxFailedAttempts, config.security.login.lockoutMinutes, user.id]
        );

        const updatedRow = lockoutResult.rows[0];
        const failedAttempts = Number(updatedRow.failed_login_attempts);
        const shouldLock = failedAttempts >= config.security.login.maxFailedAttempts;
        const lockoutUntil = updatedRow.locked_until ? new Date(updatedRow.locked_until) : null;

        await auditLogger.log({
          userId: user.id,
          username: user.name,
          action: 'LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          entityName: user.email,
          details: {
            reason: 'invalid_password',
            failed_attempts: failedAttempts,
            locked_until: lockoutUntil,
          },
          ipAddress: ip,
          userAgent,
        });

        if (shouldLock && lockoutUntil) {
          return respondAccountLocked(res, lockoutUntil);
        }
        const remaining = config.security.login.maxFailedAttempts - failedAttempts;
        return res.status(401).json({
          error: 'invalid_credentials',
          message: 'Ogiltiga inloggningsuppgifter',
          remainingAttempts: remaining,
        });
      }

      // Skapa JWT access token (kortare livslängd för säkerhet)
      const accessToken = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: user.role || 'handler',
          type: 'access'
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' } // 15 minuter för access token
      );

      // Skapa refresh token (längre livslängd)
      const refreshToken = jwt.sign(
        { 
          id: user.id, 
          email: user.email,
          type: 'refresh'
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' } // 7 dagar för refresh token
      );

      // Spara refresh token i databasen (för att kunna invalidera vid behov)
      await pool.query(
        'UPDATE handlers SET refresh_token = $1, last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
        [hashRefreshToken(refreshToken), user.id]
      );

      await auditLogger.logLogin(user.id, user.name, ip, userAgent);

      // Returnera användardata och tokens
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || 'handler'
        },
        accessToken,
        refreshToken
      });

    } catch (error) {
      console.error('Login error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Internt serverfel' });
    }
  });

  // Registrera ny användare (endast för admin)
  router.post('/register', authenticateToken, sanitizeTextInputs, validateUserRegistration, async (req: Request, res: Response) => {
    try {
      // Kontrollera om användaren är admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Endast admin kan skapa nya användare' });
      }

      const { name, email, password, role = 'handler' } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Namn, email och lösenord krävs' });
      }

      // Hasha lösenord med bcrypt
      const hashedPassword = await bcrypt.hash(password, ROUNDS);

      // Skapa användare
      const result = await pool.query(
        'INSERT INTO handlers (name, email, password_hash, role, active) VALUES ($1, $2, $3, $4, true) RETURNING id, name, email, role',
        [name, email, hashedPassword, role]
      );

      const newUser = result.rows[0];

      if (req.user) {
        const { ip, userAgent } = getRequestContext(req);
        await auditLogger.log({
          userId: req.user.id,
          username: req.user.name,
          action: 'USER_CREATED',
          entityType: 'user',
          entityId: newUser.id,
          entityName: newUser.email,
          details: { role: newUser.role },
          ipAddress: ip,
          userAgent,
        });
      }

      res.status(201).json({
        message: 'Användare skapad',
        user: newUser
      });

    } catch (error) {
      console.error('Register error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Internt serverfel' });
    }
  });

  // Hämta användarinfo (för att verifiera token)
  router.get('/me', authenticateToken, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, role FROM handlers WHERE id = $1 AND active = true',
        [req.user?.id]
      );

      if (!req.user || result.rows.length === 0) {
        return res.status(404).json({ error: 'Användare hittades inte' });
      }

      res.json({ user: result.rows[0] });
    } catch (error) {
      console.error('Get user error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Internt serverfel' });
    }
  });

  // Refresh token endpoint
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token krävs' });
      }

      // Verifiera refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as any;
      
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Ogiltig token typ' });
      }

      // Kontrollera att token finns i databasen
      const result = await pool.query(
        'SELECT id, name, email, role FROM handlers WHERE id = $1 AND refresh_token = $2 AND active = true',
        [decoded.id, hashRefreshToken(refreshToken)]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Ogiltig refresh token' });
      }

      const user = result.rows[0];

      // Skapa ny access token
      const newAccessToken = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: user.role || 'handler',
          type: 'access'
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      res.json({
        accessToken: newAccessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || 'handler'
        }
      });

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ error: 'Ogiltig refresh token' });
      }
      console.error('Refresh token error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Internt serverfel' });
    }
  });

  // Logout (invalidera refresh token)
  router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
    try {
      // Ta bort refresh token från databasen
      await pool.query(
        'UPDATE handlers SET refresh_token = NULL WHERE id = $1',
        [req.user?.id]
      );
      
      res.json({ message: 'Utloggning lyckades' });
    } catch (error) {
      console.error('Logout error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ error: 'Internt serverfel' });
    }
  });

  return router;
};

export default users;
