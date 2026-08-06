import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';
import { getClientIp } from './ip.js';
import { queryFirst, runQuery } from './db.js';
import { randomUUID } from './crypto.js';
import type { HonoContext } from './types.js';

const RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimits(): void {
  RATE_LIMITS.clear();
}

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

export function rateLimitUser(
  action: string,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000
): MiddlewareHandler {
  return (c, next) => {
    if (c.env.DISABLE_RATE_LIMIT?.toLowerCase() === 'true') {
      return next();
    }

    const user = c.get('user');
    if (!user) return next();

    const key = `${user.id}:${action}`;
    if (isRateLimited(key, maxRequests, windowMs)) {
      return Promise.resolve(jsonError(c, 'Too many requests', 429));
    }
    return next();
  };
}

export async function checkUserActionLimit(
  c: HonoContext,
  action: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (c.env.DISABLE_RATE_LIMIT?.toLowerCase() === 'true') {
    return false;
  }

  const user = c.get('user');
  if (!user) return false;

  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM rate_limit_events WHERE user_id = ? AND action = ? AND created_at > ?`,
    [user.id, action, since]
  );
  return (row?.count ?? 0) >= limit;
}

export async function recordUserAction(c: HonoContext, action: string): Promise<void> {
  const user = c.get('user');
  if (!user) return;

  await runQuery(
    c,
    `INSERT INTO rate_limit_events (id, user_id, action, created_at) VALUES (?, ?, ?, ?)`,
    [randomUUID(), user.id, action, new Date().toISOString()]
  );
}
