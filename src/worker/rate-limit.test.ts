import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  rateLimit,
  rateLimitUser,
  checkUserActionLimit,
  recordUserAction,
  resetRateLimits,
} from './rate-limit.js';
import type { SessionUser, WorkerBindings } from './types.js';

function mockD1(handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {}): D1Database {
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

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {},
  overrides: Partial<WorkerBindings> = {}
) {
  return {
    DB: mockD1(d1Handlers),
    AVATARS: {} as unknown as WorkerBindings['AVATARS'],
    THUMBNAILS: {} as unknown as WorkerBindings['THUMBNAILS'],
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    ADMINS: '',
    DISABLE_RATE_LIMIT: 'false',
    ...overrides,
  };
}

const TEST_USER: SessionUser = {
  id: 'user-1',
  username: 'alice',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  isAdmin: false,
};

describe('rate-limit helpers', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe('rateLimit', () => {
    it('allows requests under the limit and rejects after the limit', async () => {
      const app = new Hono<{ Bindings: WorkerBindings }>();
      app.use('/test', rateLimit('test', 2, 1000), (c) => c.json({ ok: true }));

      const env = makeEnv();
      const res1 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res2 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res3 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(429);
    });

    it('bypasses rate limiting when DISABLE_RATE_LIMIT is true', async () => {
      const app = new Hono<{ Bindings: WorkerBindings }>();
      app.use('/test', rateLimit('test', 1, 1000), (c) => c.json({ ok: true }));

      const env = makeEnv({}, { DISABLE_RATE_LIMIT: 'true' });
      const res1 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res2 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('rateLimitUser', () => {
    it('allows requests under the limit and rejects after the limit', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.use('/test', rateLimitUser('test', 2, 1000), (c) => c.json({ ok: true }));

      const env = makeEnv();
      const res1 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res2 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res3 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(429);
    });

    it('bypasses user rate limiting when DISABLE_RATE_LIMIT is true', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.use('/test', rateLimitUser('test', 1, 1000), (c) => c.json({ ok: true }));

      const env = makeEnv({}, { DISABLE_RATE_LIMIT: 'true' });
      const res1 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      const res2 = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('checkUserActionLimit', () => {
    it('returns true when the action limit is reached', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.get('/test', async (c) => {
        const limited = await checkUserActionLimit(c, 'test_action', 3, 60 * 60 * 1000);
        return c.json({ limited });
      });

      const env = makeEnv({
        'COUNT(*) as count FROM rate_limit_events': () => [{ count: 3 }],
      });
      const res = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      expect(res.status).toBe(200);
      expect((await res.json()) as { limited: boolean }).toEqual({ limited: true });
    });

    it('returns false when under the limit', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.get('/test', async (c) => {
        const limited = await checkUserActionLimit(c, 'test_action', 5, 60 * 60 * 1000);
        return c.json({ limited });
      });

      const env = makeEnv({
        'COUNT(*) as count FROM rate_limit_events': () => [{ count: 2 }],
      });
      const res = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      expect(res.status).toBe(200);
      expect((await res.json()) as { limited: boolean }).toEqual({ limited: false });
    });

    it('bypasses check when DISABLE_RATE_LIMIT is true', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.get('/test', async (c) => {
        const limited = await checkUserActionLimit(c, 'test_action', 1, 60 * 60 * 1000);
        return c.json({ limited });
      });

      const env = makeEnv(
        {
          'COUNT(*) as count FROM rate_limit_events': () => [{ count: 100 }],
        },
        { DISABLE_RATE_LIMIT: 'true' }
      );
      const res = await app.fetch(new Request('http://localhost/test'), env as unknown as Record<string, unknown>);
      expect(res.status).toBe(200);
      expect((await res.json()) as { limited: boolean }).toEqual({ limited: false });
    });
  });

  describe('recordUserAction', () => {
    it('inserts a rate_limit_event row', async () => {
      const app = new Hono<{ Bindings: WorkerBindings; Variables: { user: SessionUser | null } }>();
      app.use('/test', (c, next) => {
        c.set('user', TEST_USER);
        return next();
      });
      app.post('/test', async (c) => {
        await recordUserAction(c, 'test_action');
        return c.json({ ok: true });
      });

      const env = makeEnv();
      const res = await app.fetch(
        new Request('http://localhost/test', { method: 'POST' }),
        env as unknown as Record<string, unknown>
      );
      expect(res.status).toBe(200);
      expect(env.DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rate_limit_events')
      );
    });
  });
});
