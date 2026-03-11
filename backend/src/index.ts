import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Pool } from "pg";
// Optional compression (graceful if package missing)
let compression: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  compression = require('compression');
} catch {
  compression = null;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");

import customers from "./routes/customers";
import efforts from "./routes/efforts";
import handlers from "./routes/handlers";
import cases from "./routes/cases";
import stats from "./routes/stats";
import shifts from "./routes/shifts";
import users from "./routes/users";
import invites from "./routes/invites";
import audit from "./routes/audit";
import auth from "./routes/auth";
import search from "./routes/search";
import { initAuditLogger } from "./utils/auditLogger";
import { config } from "./config";
import { normalizeAvailableFor } from "./utils/efforts";
import { globalLimiter } from "./middleware/rateLimit";

// Konfigurationen valideras automatiskt vid import av config

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy ? 1 : 0);

const corsOptions: cors.CorsOptions = {
  origin: config.cors.origin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
  credentials: config.cors.credentials,
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      frameAncestors: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  next();
});
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// Response compression if available
if (compression) {
  app.use(compression());
}

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/api', globalLimiter);

// Lightweight request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/healthz') return; // reduce noise
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get("/api/healthz", (_req, res) => {
  res.json({ 
    ok: true, 
    uptime: process.uptime(), 
    version: pkg.version,
    message: 'Backend is running and responding to requests'
  });
});



const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.pool.min,
  max: config.database.pool.max,
  idleTimeoutMillis: config.database.pool.idleTimeout,
});

// Initiera AuditLogger
initAuditLogger(pool);

// För utveckling/test: säkerställ att kritiska schema-tillägg finns (idempotent)
async function ensureSchema() {
  try {
    const loginAttemptsCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'handlers' AND column_name = 'failed_login_attempts' LIMIT 1`
    );
    if (loginAttemptsCheck.rowCount === 0) {
      console.log('🛠️  Skapar kolumner handlers.failed_login_attempts/locked_until (saknades) ...');
      await pool.query(
        `ALTER TABLE handlers ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;`
      );
      await pool.query(
        `ALTER TABLE handlers ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;`
      );
      console.log('✅ handlers.failed_login_attempts/locked_until skapade');
    }

    // Kolla om kolumnen customers.is_protected finns
    const check = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'is_protected' LIMIT 1`
    );
    if (check.rowCount === 0) {
      console.log('🛠️  Skapar kolumn customers.is_protected (saknades) ...');
      await pool.query(
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;`
      );
      await pool.query(
        `COMMENT ON COLUMN customers.is_protected IS 'True if customer has protected identity. Initials should be masked in API for unauthorized viewers.';`
      );
      console.log('✅ customers.is_protected skapad');
    }

    const groupCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'is_group' LIMIT 1`
    );
    if (groupCheck.rowCount === 0) {
      console.log('🛠️  Skapar kolumn customers.is_group (saknades) ...');
      await pool.query(
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;`
      );
      console.log('✅ customers.is_group skapad');
    }

    await pool.query(`ALTER TABLE customers ALTER COLUMN gender DROP NOT NULL;`);
    await pool.query(`ALTER TABLE customers ALTER COLUMN birth_year DROP NOT NULL;`);

    // Normalisera insats-kategorier (ersätt Förebyggande enligt krav)
    try {
      const efforts = await pool.query(`SELECT id, name, available_for FROM efforts`);
      for (const row of efforts.rows) {
        const normalized = normalizeAvailableFor(row.name, row.available_for || '');
        if (normalized !== row.available_for) {
          await pool.query(`UPDATE efforts SET available_for = $1 WHERE id = $2`, [normalized, row.id]);
        }
      }
    } catch (effortsError) {
      console.warn('⚠️  Kunde inte normalisera efforts.available_for:', (effortsError as any)?.message || effortsError);
    }
  } catch (err) {
    console.warn('⚠️  ensureSchema misslyckades (fortsätter ändå):', (err as any)?.message || err);
  }
}

// Kör schema-säkring: audit_log alltid (kritiskt för login), övrigt endast i utveckling
async function ensureAuditLog() {
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log' LIMIT 1`
    );
    if (r.rowCount === 0) {
      console.log('🛠️  Skapar audit_log-tabell (saknades) ...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES handlers(id),
          username VARCHAR(255) NOT NULL,
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          entity_id INTEGER,
          entity_name VARCHAR(255),
          details JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`);
      console.log('✅ audit_log skapad');
    }
  } catch (err) {
    console.warn('⚠️  ensureAuditLog misslyckades:', (err as any)?.message || err);
  }
}
void ensureAuditLog();

if (config.isDevelopment) {
  void ensureSchema();
}



// Viktigt: allt under /api
app.use("/api/customers", customers(pool));
app.use("/api/efforts", efforts(pool));
app.use("/api/handlers", handlers(pool));
app.use("/api/cases", cases(pool));
app.use("/api/stats", stats(pool));
app.use("/api/shifts", shifts(pool));
app.use("/api/users", users(pool));
app.use("/api/invites", invites(pool));
app.use("/api/audit", audit(pool));
app.use("/api/auth", auth(pool));
app.use("/api/search", search(pool));

// Central error handler (keep last)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`🚀 API-servern kör på port ${config.port}`);
  console.log(`📡 API-prefix: /api/*`);
});
