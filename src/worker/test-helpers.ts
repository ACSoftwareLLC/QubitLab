import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { vi } from 'vitest';

export type D1Handlers = Record<string, (sql: string, params: unknown[]) => unknown>;

export function mockD1(handlers: D1Handlers = {}): D1Database {
  let currentSql = '';
  let currentParams: unknown[] = [];
  const rateLimits = new Map<string, { count: number; reset_at: string }>();

  function handleRateLimit(sql: string, params: unknown[]): unknown {
    if (sql.includes('INSERT INTO rate_limits')) {
      const key = String(params[0]);
      const resetAt = String(params[1]);
      const existing = rateLimits.get(key);
      const now = new Date(Date.now()).toISOString();
      if (!existing || existing.reset_at < now) {
        rateLimits.set(key, { count: 1, reset_at: resetAt });
      } else {
        existing.count += 1;
      }
      return { success: true };
    }
    if (sql.includes('SELECT count, reset_at FROM rate_limits WHERE key = ?')) {
      const key = String(params[0]);
      const existing = rateLimits.get(key);
      const now = new Date(Date.now()).toISOString();
      if (!existing || existing.reset_at < now) {
        return null;
      }
      return existing;
    }
    if (sql.includes('DELETE FROM rate_limits WHERE reset_at < ?')) {
      const now = String(params[0]);
      for (const [key, value] of rateLimits.entries()) {
        if (value.reset_at < now) {
          rateLimits.delete(key);
        }
      }
      return { success: true };
    }
    return undefined;
  }

  const prepared = {
    bind: vi.fn((...params: unknown[]) => {
      currentParams = params;
      return prepared;
    }),
    first: vi.fn(async <T>() => {
      const rateLimitResult = handleRateLimit(currentSql, currentParams);
      if (rateLimitResult !== undefined) {
        return rateLimitResult as T;
      }
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          const result = handler(currentSql, currentParams);
          return Array.isArray(result) ? (result[0] as T) : (result as T);
        }
      }
      return null;
    }),
    all: vi.fn(async <T>() => {
      const rateLimitResult = handleRateLimit(currentSql, currentParams);
      if (rateLimitResult !== undefined) {
        return { results: Array.isArray(rateLimitResult) ? (rateLimitResult as T[]) : [] } as {
          results: T[];
        };
      }
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          const result = handler(currentSql, currentParams);
          return { results: Array.isArray(result) ? (result as T[]) : [] } as {
            results: T[];
          };
        }
      }
      return { results: [] as T[] };
    }),
    run: vi.fn(async () => {
      const rateLimitResult = handleRateLimit(currentSql, currentParams);
      if (rateLimitResult !== undefined) {
        return rateLimitResult as { success: true };
      }
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          return handler(currentSql, currentParams) as { success: true };
        }
      }
      return { success: true };
    }),
    raw: vi.fn(),
  };

  return {
    prepare: vi.fn((sql: string) => {
      currentSql = sql;
      currentParams = [];
      return prepared;
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

export function mockR2(overrides: Partial<R2Bucket> = {}): R2Bucket {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
    ...overrides,
  } as unknown as R2Bucket;
}

export function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

export const DEFAULT_USER = {
  id: 'user-1',
  username: 'alice',
  password_hash: 'hash',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  is_admin: 0,
  created_at: '2026-07-01T00:00:00Z',
};

export const ADMIN_COOKIE = 'sessionId=admin-session';
export const USER_COOKIE = 'sessionId=user-session';

export function makeEnv(
  d1Handlers: D1Handlers = {},
  user = DEFAULT_USER,
  overrides: Partial<{
    AVATARS: R2Bucket;
    THUMBNAILS: R2Bucket;
    SESSION_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_SKIP_VERIFICATION: string;
    DISABLE_RATE_LIMIT: string;
    DISABLE_ORIGIN_VALIDATION: string;
  }> = {}
) {
  return {
    DB: mockD1({
      'FROM sessions': () => [user],
      'FROM users WHERE id': () => [user],
      ...d1Handlers,
    }),
    AVATARS: overrides.AVATARS ?? mockR2(),
    THUMBNAILS: overrides.THUMBNAILS ?? mockR2(),
    SESSION_SECRET: overrides.SESSION_SECRET ?? 'test-secret',
    TURNSTILE_SECRET_KEY: overrides.TURNSTILE_SECRET_KEY ?? '',
    TURNSTILE_SITE_KEY: overrides.TURNSTILE_SITE_KEY ?? '',
    TURNSTILE_SKIP_VERIFICATION: overrides.TURNSTILE_SKIP_VERIFICATION ?? '',
    DISABLE_RATE_LIMIT: overrides.DISABLE_RATE_LIMIT ?? 'true',
    DISABLE_ORIGIN_VALIDATION: overrides.DISABLE_ORIGIN_VALIDATION ?? '',
  };
}

export function makeAdminEnv(
  d1Handlers: D1Handlers = {},
  overrides?: Parameters<typeof makeEnv>[2]
) {
  return makeEnv(
    d1Handlers,
    { ...DEFAULT_USER, username: 'alex', is_admin: 1 },
    overrides
  );
}
