import { Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '../config';

export const TOO_MANY_REQUESTS_RESPONSE = Object.freeze({ error: 'too_many_requests' });

export const rateLimitKeyGenerator = (req: Request, _res: Response) => ipKeyGenerator(req.ip ?? 'unknown');

const createLimiter = (windowMs: number, max: number): RequestHandler => {
  if (max <= 0) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyGenerator,
    message: TOO_MANY_REQUESTS_RESPONSE,
  });
};

export const globalLimiter = createLimiter(config.rateLimit.windowMs, config.rateLimit.globalMax);

export const loginLimiter: RequestHandler = config.rateLimit.loginMax > 0
  ? rateLimit({
      windowMs: config.rateLimit.loginWindowMs,
      max: config.rateLimit.loginMax,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      keyGenerator: (req: Request) => {
        const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
        const email = rawEmail.trim().toLowerCase();
        const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
        const ipKey = ipKeyGenerator(ip);
        return `${ipKey}:${email}`;
      },
      message: TOO_MANY_REQUESTS_RESPONSE,
    })
  : (_req, _res, next) => next();

export const loginIpLimiter: RequestHandler = config.rateLimit.loginIpMax > 0
  ? rateLimit({
      windowMs: config.rateLimit.loginIpWindowMs,
      max: config.rateLimit.loginIpMax,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      keyGenerator: rateLimitKeyGenerator,
      message: TOO_MANY_REQUESTS_RESPONSE,
    })
  : (_req, _res, next) => next();
