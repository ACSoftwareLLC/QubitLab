import { describe, it, expect, vi } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from '../index.js';

function mockD1(
  handlers: Record<string, (sql: string, params: unknown[]) => unknown>
): D1Database {
  let currentSql = '';
  let currentParams: unknown[] = [];

  const prepared = {
    bind: vi.fn((...params: unknown[]) => {
      currentParams = params;
      return prepared;
    }),
    first: vi.fn(async <T>() => {
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          const result = handler(currentSql, currentParams);
          return Array.isArray(result) ? (result[0] as T) : (result as T);
        }
      }
      return null;
    }),
    all: vi.fn(async <T>() => {
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

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {}
) {
  return {
    DB: mockD1(d1Handlers),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
  };
}

describe('user profile route', () => {
  it('returns a public user profile', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [
        {
          id: 'user-1',
          username: 'alice',
          pfp_key: 'avatars/alice.png',
          first_name: 'Alice',
          last_name: 'Admin',
          bio: 'Hello',
          created_at: '2026-07-01T00:00:00Z',
          is_admin: 1,
        },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/users/alice'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string; isAdmin: boolean; pfpUrl: string | null } };
    expect(body.user.username).toBe('alice');
    expect(body.user.isAdmin).toBe(true);
    expect(body.user.pfpUrl).toBe('/auth/users/user-1/avatar');
  });

  it('returns 404 for unknown user', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/users/unknown'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(404);
  });
});
