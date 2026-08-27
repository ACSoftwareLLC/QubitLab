import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from '../index.js';
import { bytesToBase64 } from '../buffer.js';
import { resetRateLimits } from '../rate-limit.js';

function mockD1(
  handlers: Record<string, (sql: string, params: unknown[]) => unknown>
): D1Database {
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

function mockR2(): R2Bucket {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

const SESSION_USER = {
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

const AUTH_COOKIE = 'sessionId=test-session';

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {},
  overrides: Partial<{
    DISABLE_RATE_LIMIT: string;
  }> = {}
) {
  return {
    DB: mockD1({
      'FROM sessions': () => [SESSION_USER],
      'FROM users WHERE id': () => [SESSION_USER],
      ...d1Handlers,
    }),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    DISABLE_RATE_LIMIT: overrides.DISABLE_RATE_LIMIT,
  };
}

const validCircuit = {
  numBits: 2,
  ops: [{ id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null }],
};

const validPngDataUrl =
  'data:image/png;base64,' +
  bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

let uuidCounter = 0;

describe('circuit routes', () => {
  beforeEach(() => {
    uuidCounter = 0;
    resetRateLimits();
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1;
      return `uuid-${uuidCounter}`;
    });
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/circuits'),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });

  it('rejects a circuit with invalid body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        method: 'POST',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });

  it('lists the user\'s circuits', async () => {
    const env = makeEnv({
      'FROM circuits WHERE user_id': () => [
        {
          id: 'c1',
          user_id: 'user-1',
          name: 'Bell state',
          circuit: JSON.stringify(validCircuit),
          thumbnail_key: 'user-1/c1/thumb.png',
          shared: 0,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
        },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        headers: { Cookie: AUTH_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { circuits: unknown[] };
    expect(body.circuits).toHaveLength(1);
    expect(body.circuits[0]).toMatchObject({
      id: 'c1',
      name: 'Bell state',
      username: 'alice',
      thumbnailUrl: '/auth/circuits/c1/thumbnail',
    });
  });

  it('creates a circuit with a thumbnail', async () => {
    const env = makeEnv({
      'INSERT INTO circuits': () => ({ success: true }),
      'FROM circuits WHERE id': () => [
        {
          id: 'uuid-2',
          user_id: 'user-1',
          name: 'Bell state',
          circuit: JSON.stringify(validCircuit),
          thumbnail_key: 'user-1/uuid-2/uuid-3.png',
          shared: 0,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        method: 'POST',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bell state',
          circuit: validCircuit,
          thumbnail: validPngDataUrl,
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { circuit: { thumbnailUrl: string } };
    expect(body.circuit.thumbnailUrl).toBe('/auth/circuits/uuid-2/thumbnail');
    expect(env.THUMBNAILS.put).toHaveBeenCalled();
  });

  it('rejects a thumbnail that is not a PNG', async () => {
    const env = makeEnv();
    const notPng = 'data:image/png;base64,' + bytesToBase64(new Uint8Array([1, 2, 3, 4, 5]));

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        method: 'POST',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bell state',
          circuit: validCircuit,
          thumbnail: notPng,
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(400);
    expect(env.THUMBNAILS.put).not.toHaveBeenCalled();
  });

  it('enforces weekly share limit', async () => {
    const env = makeEnv({
      'FROM circuits WHERE id': () => [
        {
          id: 'c1',
          user_id: 'user-1',
          name: 'Bell',
          circuit: JSON.stringify(validCircuit),
          thumbnail_key: null,
          shared: 0,
          shared_at: null,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      'COUNT(*) as count FROM rate_limit_events': () => [{ count: 20 }],
      'UPDATE circuits': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits/c1', {
        method: 'PATCH',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared: true }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(429);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'Weekly share limit reached (20)',
    });
  });

  it('rejects sharing when user is banned', async () => {
    const env = makeEnv({
      'FROM circuits WHERE id': () => [
        {
          id: 'c1',
          user_id: 'user-1',
          name: 'Bell',
          circuit: JSON.stringify(validCircuit),
          thumbnail_key: null,
          shared: 0,
          shared_at: null,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      'FROM users WHERE id': () => [
        { ...SESSION_USER, banned_until: '2099-01-01T00:00:00Z', banned_reason: 'Test ban' },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits/c1', {
        method: 'PATCH',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared: true }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('banned');
  });

  it('enforces create circuit rate limit', async () => {
    const env = makeEnv(
      {
        'INSERT INTO circuits': () => ({ success: true }),
        'FROM circuits WHERE id': () => [
          {
            id: 'uuid-2',
            user_id: 'user-1',
            name: 'Bell state',
            circuit: JSON.stringify(validCircuit),
            thumbnail_key: null,
            shared: 0,
            shared_at: null,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
      },
      { DISABLE_RATE_LIMIT: 'false' }
    );

    const responses: Response[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await app.fetch(
        new Request('http://localhost/auth/circuits', {
          method: 'POST',
          headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Circuit ${i}`, circuit: validCircuit }),
        }),
        env as unknown as Record<string, unknown>,
        mockExecutionCtx()
      );
      responses.push(res);
    }

    const successCount = responses.filter((r) => r.status === 201).length;
    const limitedCount = responses.filter((r) => r.status === 429).length;
    expect(successCount).toBe(10);
    expect(limitedCount).toBe(1);
    expect((await responses[10].json()) as { error: string }).toEqual({
      error: 'Too many requests',
    });
  });

  it('enforces per-user circuit quota', async () => {
    const env = makeEnv({
      'COUNT(*) as count FROM circuits WHERE user_id': () => [{ count: 100 }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        method: 'POST',
        headers: { Cookie: AUTH_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Over quota', circuit: validCircuit }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('quota exceeded');
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const env = makeEnv();
    const bigBody = JSON.stringify({ name: 'x'.repeat(2_000_000), circuit: validCircuit });

    const res = await app.fetch(
      new Request('http://localhost/auth/circuits', {
        method: 'POST',
        headers: {
          Cookie: AUTH_COOKIE,
          'Content-Type': 'application/json',
          'Content-Length': String(bigBody.length),
        },
        body: bigBody,
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(413);
  });
});
