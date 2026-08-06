import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';
import { getClientIp } from './ip.js';

const RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(ip: string, action: string): string {
  return `${ip}:${action}`;
}

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = RATE_LIMITS.get(key);

  if (!record || record.resetAt < now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count += 1;
  return record.count > maxRequests;
}

export function rateLimit(
  action: string,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000
): MiddlewareHandler {
  return (c, next) => {
    if (c.env.DISABLE_RATE_LIMIT?.toLowerCase() === 'true') {
      return next();
    }

    const ip = getClientIp(c);
    const key = rateLimitKey(ip, action);
    if (isRateLimited(key, maxRequests, windowMs)) {
      return Promise.resolve(jsonError(c, 'Too many requests', 429));
    }
    return next();
  };
}
