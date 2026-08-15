import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const sharedCircuitRow = {
  id: 'shared-1',
  user_id: 'user-1',
  username: 'alice',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  is_admin: 1,
  name: 'Bell state',
  circuit: JSON.stringify({ numBits: 2, ops: [] }),
  thumbnail_key: 'user-1/shared-1/thumb.png',
  shared: 1,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
};

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {}
) {
  return {
    DB: mockD1({
      'FROM sessions': () => [],
      ...d1Handlers,
    }),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
  };
}

describe('marketplace routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only shared circuits without authentication', async () => {
    const env = makeEnv({
      'c.shared = 1': () => [sharedCircuitRow],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/marketplace'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { circuits: unknown[] };
    expect(body.circuits).toHaveLength(1);
    expect(body.circuits[0]).toMatchObject({
      id: 'shared-1',
      name: 'Bell state',
      username: 'alice',
      userId: 'user-1',
      shared: true,
      isAdmin: true,
      thumbnailUrl: '/auth/marketplace/shared-1/thumbnail',
    });
  });

  it('returns a shared circuit by id without authentication', async () => {
    const env = makeEnv({
      'c.id = ? AND c.shared = 1': () => [sharedCircuitRow],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/marketplace/shared-1'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { circuit: Record<string, unknown> };
    expect(body.circuit).toMatchObject({
      id: 'shared-1',
      username: 'alice',
      shared: true,
    });
  });

  it('returns 404 for private or missing circuits', async () => {
    const env = makeEnv({
      'c.id = ? AND c.shared = 1': () => [],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/marketplace/private-1'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(404);
  });

  it('returns a shared circuit thumbnail without authentication', async () => {
    const env = makeEnv({
      'SELECT thumbnail_key FROM circuits WHERE id = ? AND shared = 1': () => [
        { thumbnail_key: 'shared/thumb.png' },
      ],
    });
    env.THUMBNAILS.get = vi.fn().mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      }),
      headers: new Headers({ 'Content-Type': 'image/png' }),
      httpEtag: '"etag"',
      size: 4,
      writeHttpMetadata: (headers: Headers) => {
        headers.set('Content-Type', 'image/png');
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/marketplace/shared-1/thumbnail'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
