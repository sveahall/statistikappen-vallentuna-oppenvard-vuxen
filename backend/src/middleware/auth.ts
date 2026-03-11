import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getAuditLogger } from "../utils/auditLogger";

// Utöka Request interface för att inkludera user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        username: string;
        role: string;
      };
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "unauthenticated" });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET!) as any;
    // Endast access-tokens får användas för API-åtkomst
    if (!user || user.type !== 'access') {
      return res.status(401).json({ error: "invalid_token" });
    }
    req.user = {
      ...user,
      username: user.name // Lägg till username för kompatibilitet
    };
    
    // Logga framgångsrik autentisering
    if (req.path !== '/audit') { // Undvik oändlig loop
      try {
        const auditLogger = getAuditLogger();
        auditLogger.logAccess(
          user.id,
          user.name,
          req.path,
          req.method
        ).catch((error) => {
          // Logga felet men låt autentiseringen fortsätta
          console.warn(`Audit logging failed for user ${user.id}:`, error.message);
        });
      } catch (error) {
        // Om audit logging misslyckas, låt autentiseringen fortsätta
        console.warn('Audit logging failed:', error);
      }
    }
    
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    return res.status(401).json({ error: "invalid_token" });
  }
}
