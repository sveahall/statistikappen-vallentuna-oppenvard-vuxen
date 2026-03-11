import { Router, Request, Response } from "express";
import { Pool } from "pg";
import { authenticateToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { sanitizeTextInputs } from "../middleware/validation";
import { normalizeAvailableFor } from "../utils/efforts";

export default function efforts(pool: Pool) {
  const router = Router();
  router.use(authenticateToken);
  const adminOnly = requireRole('admin');

  // Helpers
  const createEffort = async (req: Request, res: Response) => {
    const { name, available_for } = req.body;
    if (!name || !available_for) {
      return res.status(400).json({ error: "Alla fält krävs" });
    }
    try {
      const normalized = normalizeAvailableFor(name, available_for);
      const result = await pool.query(
        "INSERT INTO efforts (name, available_for) VALUES ($1, $2) RETURNING *",
        [name, normalized]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: "En insats med det namnet och samma tillgänglighet finns redan" });
      }
      console.error("Fel vid skapande av insats:", err);
      res.status(500).json({ error: "Kunde inte skapa insats" });
    }
  };

  // Hämta alla insatser (med stöd för all=true)
  router.get("/", async (req, res) => {
    try {
      let result;
      if (req.query.all === "true") {
        result = await pool.query("SELECT * FROM efforts ORDER BY id ASC");
      } else {
        result = await pool.query("SELECT * FROM efforts WHERE active = TRUE ORDER BY id ASC");
      }
      const rows = result.rows.map(row => {
        const normalized = normalizeAvailableFor(row.name, row.available_for);
        if (normalized !== row.available_for) {
          row.available_for = normalized;
        }
        return row;
      });
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Kunde inte hämta insatser" });
    }
  });

  const deactivateEffort = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE efforts SET active = FALSE WHERE id = $1 RETURNING *",
        [id]
      );
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte avaktivera insats" });
    }
  };

  const activateEffort = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE efforts SET active = TRUE WHERE id = $1 RETURNING *",
        [id]
      );
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte återaktivera insats" });
    }
  };

  const updateEffort = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, available_for } = req.body;
    if (!name || !available_for) {
      return res.status(400).json({ error: "Alla fält krävs" });
    }
    try {
      const normalized = normalizeAvailableFor(name, available_for);
      const result = await pool.query(
        "UPDATE efforts SET name = $1, available_for = $2 WHERE id = $3 RETURNING *",
        [name, normalized, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Insats hittades inte" });
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Kunde inte uppdatera insats" });
    }
  };

  const deleteEffort = async (_req: Request, res: Response) => {
    // Ingen hårdradering – använd avaktivera
    return res.status(405).json({ error: 'Method Not Allowed: hård radering är avstängd. Använd avaktivera/återaktivera.' });
  };

  // Skrivande endpoints med admin-skydd och sanering
  router.post("/", adminOnly, sanitizeTextInputs, createEffort);
  router.put("/:id", adminOnly, sanitizeTextInputs, updateEffort);
  router.post("/:id/activate", adminOnly, activateEffort);
  router.post("/:id/deactivate", adminOnly, deactivateEffort);
  router.delete("/:id", adminOnly, deleteEffort);

  // Bakåtkompatibilitet för tidigare PUT-aktivera/inaktivera
  router.put("/:id/activate", adminOnly, activateEffort);
  router.put("/:id/deactivate", adminOnly, deactivateEffort);

  return router;
}
