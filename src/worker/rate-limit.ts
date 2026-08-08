import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';
import { getClientIp } from './ip.js';
import { queryFirst, runQuery } from './db.js';
import { randomUUID } from './crypto.js';
import type { HonoContext } from './types.js';

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

// D1-backed fixed-window limits for abuse-prone endpoints.
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'register': { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  'login': { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  'account/password': { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  'account/avatar': { maxAttempts: 20, windowMs: 15 * 60 * 1000 },
  'circuit_create': { maxAttempts: 30, windowMs: 15 * 60 * 1000 },
  'circuit_save': { maxAttempts: 30, windowMs: 15 * 60 * 1000 },
  'POST /analytics/track': { maxAttempts: 60, windowMs: 60 * 1000 },
};

function isRateLimitDisabled(c: HonoContext): boolean {
  return c.env.DISABLE_RATE_LIMIT?.toLowerCase() === 'true';
}

async function checkRateLimitInternal(
  db: D1Database,
  key: string,
  config: RateLimitConfig
): Promise<boolean> {
  const resetAt = new Date(Date.now() + config.windowMs).toISOString();

  try {
    // Insert or, if an unexpired row exists, increment its count.
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN excluded.reset_at > reset_at THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN excluded.reset_at > reset_at THEN excluded.reset_at ELSE reset_at END`
      )
      .bind(key, resetAt)
      .run();
  } catch (err) {
    console.error('Rate limit D1 error:', err);
    // Fail open to avoid self-DoS
    return false;
  }

  try {
    const row = await db
      .prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
      .bind(key)
      .first<{ count: number; reset_at: string }>();

    return (row?.count ?? 0) > config.maxAttempts;
  } catch (err) {
    console.error('Rate limit D1 read error:', err);
    return false;
  }
}

export function rateLimit(
  action: string,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000
): MiddlewareHandler {
  return async (c, next) => {
    if (isRateLimitDisabled(c)) {
      return next();
    }

    const ip = getClientIp(c);
    const key = `ip:${ip}:${action}`;
    const limited = await checkRateLimitInternal(c.env.DB, key, { maxAttempts: maxRequests, windowMs });
    if (limited) {
      return jsonError(c, 'Too many requests', 429);
    }
    return next();
  };
}

export function rateLimitUser(
  action: string,
  maxRequests = 5,
  windowMs = 15 * 60 * 1000
): MiddlewareHandler {
  return async (c, next) => {
    if (isRateLimitDisabled(c)) {
      return next();
    }

    const user = c.get('user');
    if (!user) return next();

    const key = `user:${user.id}:${action}`;
    const limited = await checkRateLimitInternal(c.env.DB, key, { maxAttempts: maxRequests, windowMs });
    if (limited) {
      return jsonError(c, 'Too many requests', 429);
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
  if (isRateLimitDisabled(c)) {
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

// Shared helper for explicitly D1-backed checks (e.g. analytics/track).
export async function checkRateLimit(
  c: HonoContext,
  limitKey: string,
  scope?: string
): Promise<void> {
  if (isRateLimitDisabled(c)) {
    return;
  }

  const config = DEFAULT_LIMITS[limitKey];
  if (!config) {
    throw new Error(`Unknown rate limit key: ${limitKey}`);
  }

  const ip = scope ?? getClientIp(c);
  const key = `ip:${ip}:${limitKey}`;
  const limited = await checkRateLimitInternal(c.env.DB, key, config);
  if (limited) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }
}

// Middleware for POST /analytics/track.
export const rateLimitAnalyticsTrack: MiddlewareHandler = async (c, next) => {
  try {
    await checkRateLimit(c, 'POST /analytics/track');
  } catch (err) {
    if (err instanceof Error && err.message === 'RATE_LIMIT_EXCEEDED') {
      return jsonError(c, 'Too many requests', 429);
    }
    throw err;
  }
  return next();
};

// Purge expired rate_limits rows.
export async function purgeOldRateLimits(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
  } catch (err) {
    console.error('Failed to purge old rate limits', err);
    throw err;
  }
}

export function resetRateLimits(): void {
  // No-op: rate limits now live in D1. Kept for test compatibility.
}

// Export for testing
export const TESTABLE = {
  DEFAULT_LIMITS,
  checkRateLimitInternal,
};
