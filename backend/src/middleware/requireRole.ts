import { Request, Response, NextFunction } from "express";

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "unauthenticated" });
    if (req.user.role !== role) return res.status(403).json({ error: "forbidden" });
    next();
  };
}
