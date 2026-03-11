import dotenv from 'dotenv';
import path from 'path';

// Bestäm vilken miljö vi kör i
// Jest sätter JEST_WORKER_ID – använd det som robust indikator för test.
const IS_JEST = typeof process.env.JEST_WORKER_ID !== 'undefined';
const RAW_ENV = process.env.NODE_ENV || 'development';
const NODE_ENV = IS_JEST ? 'test' : RAW_ENV;
const IS_TEST = NODE_ENV === 'test';

// Ladda rätt .env-fil baserat på miljön
const envFile = path.resolve(process.cwd(), `.env.${NODE_ENV}`);
dotenv.config({ path: envFile });

const toInt = (value: string | undefined, defaultValue: number): number => {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const extractDatabaseName = (databaseUrl: string): string | null => {
  try {
    const url = new URL(databaseUrl);
    const name = url.pathname.replace(/^\//, '');
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
};

export const TRUST_PROXY = ((process.env.TRUST_PROXY ?? 'true').toLowerCase() === 'true');

const LOGIN_WINDOW_MS = toInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60_000);
const LOGIN_MAX = toInt(process.env.LOGIN_RATE_LIMIT_MAX, 20);
const LOGIN_IP_WINDOW_MS = toInt(process.env.LOGIN_IP_RATE_LIMIT_WINDOW_MS, LOGIN_WINDOW_MS);
const LOGIN_IP_MAX = toInt(process.env.LOGIN_IP_RATE_LIMIT_MAX, 50);
const LOGIN_MAX_FAILED_ATTEMPTS = toInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 5);
const LOGIN_LOCKOUT_MINUTES = toInt(process.env.LOGIN_LOCKOUT_MINUTES, 15);

// Validera att alla kritiska variabler finns
function validateRequiredEnvVars() {
  // I testmiljö räcker det med JWT_SECRET; övriga kan mockas/inte användas
  const required = IS_TEST
    ? ['JWT_SECRET']
    : ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN', 'ALIAS_SECRET'];

  const missing: string[] = [];
  
  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`❌ KRITISKT: Följande miljövariabler saknas: ${missing.join(', ')}\n   Kontrollera att filen .env.${NODE_ENV} finns och innehåller alla nödvändiga variabler.`);
  }

  // Validera JWT_SECRET
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('❌ KRITISKT: JWT_SECRET måste vara minst 32 tecken lång!');
  }

  // Validera DATABASE_URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    console.warn('⚠️  VARNING: DATABASE_URL bör använda postgresql:// istället för postgres:// för bättre kompatibilitet');
  }

  if (NODE_ENV === 'production' && process.env.DATABASE_URL) {
    const dbName = extractDatabaseName(process.env.DATABASE_URL);
    const blockedTokens = ['template', 'dev'];
    if (dbName) {
      const normalized = dbName.toLowerCase();
      const hasBlockedToken = blockedTokens.some(token => normalized.includes(token));
      if (hasBlockedToken) {
        const message = `DATABASE_URL pekar på databas "${dbName}". Varje kommun måste ha en egen databas utan "template" eller "dev" i namnet.`;
        throw new Error(`❌ KRITISKT: ${message}`);
      }
    } else {
      console.warn('⚠️  VARNING: Kunde inte extrahera databasnamn från DATABASE_URL för isoleringskontroll.');
    }
  }
}

// Konfigurationsobjekt
export const config = {
  // Miljö
  env: NODE_ENV,
  isDevelopment: NODE_ENV === 'development',
  isStaging: NODE_ENV === 'staging',
  isProduction: NODE_ENV === 'production',

  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  trustProxy: TRUST_PROXY,

  // Database
  database: {
    url: process.env.DATABASE_URL!,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
      acquireTimeout: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '60000', 10),
    }
  },

  // Security
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  // CORS
  cors: {
    // Hantera avsaknad av CORS_ORIGIN säkert (särskilt i test)
    origin: (process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
      : []),
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // Frontend
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  // Rate Limiting
  rateLimit: {
    redisUrl: process.env.REDIS_URL,
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    globalMax: toInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? process.env.RATE_LIMIT_MAX_REQUESTS, 1_500),
    loginWindowMs: LOGIN_WINDOW_MS,
    loginMax: LOGIN_MAX,
    loginIpWindowMs: LOGIN_IP_WINDOW_MS,
    loginIpMax: LOGIN_IP_MAX,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    auditEnabled: process.env.AUDIT_LOGGING_ENABLED === 'true',
  },

  security: {
    login: {
      maxFailedAttempts: LOGIN_MAX_FAILED_ATTEMPTS,
      lockoutMinutes: LOGIN_LOCKOUT_MINUTES,
    },
  },

  // HTTPS
  https: {
    enabled: process.env.HTTPS_ENABLED === 'true',
    certPath: process.env.SSL_CERT_PATH,
    keyPath: process.env.SSL_KEY_PATH,
  },

  // Session
  session: {
    timeout: parseInt(process.env.SESSION_TIMEOUT || '1800000', 10),
  },

  // Backup
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
  },
};

// Validera konfigurationen vid import
validateRequiredEnvVars();

// Logga konfiguration (utan känslig information) endast i icke-produktionsmiljöer
if (!config.isProduction) {
  console.log(`🚀 Konfiguration laddad för miljö: ${config.env}`);
  console.log(`📡 Server kommer köra på port: ${config.port}`);
  console.log(`🔒 HTTPS: ${config.https.enabled ? 'AKTIVERAT' : 'INAKTIVERAT'}`);
  console.log(`🗄️  Database pool: ${config.database.pool.min}-${config.database.pool.max} connections`);
  console.log(`🌐 CORS origins: ${config.cors.origin.length} tillåtna`);
  console.log(`⚡ Rate limiting: ${config.rateLimit.globalMax} requests per ${config.rateLimit.windowMs / 1000 / 60} minuter`);
  const dbUrlLog = config.database.url
    ? config.database.url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
    : '(unset)';
  console.log(`🔗 Database URL: ${dbUrlLog}`);
} else {
  console.log('✅ Konfiguration laddad för produktionsmiljö');
}

export default config;
