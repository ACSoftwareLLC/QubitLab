import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from '../index.js';
import { bytesToBase64 } from '../buffer.js';

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

const SESSION_USER = {
  id: 'user-1',
  username: 'alice',
  password_hash: 'hash',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  created_at: '2026-07-01T00:00:00Z',
};

const AUTH_COOKIE = 'sessionId=test-session';

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {}
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
    ADMINS: '',
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
});
