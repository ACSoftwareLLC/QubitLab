import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../minio.js', () => ({
  minioClient: {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(),
    removeObject: vi.fn().mockResolvedValue(undefined),
  },
  ensureBuckets: vi.fn(),
}));

import { pool } from '../db.js';
import { minioClient } from '../minio.js';
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;
const getObjectMock = minioClient.getObject as unknown as ReturnType<typeof vi.fn>;

const sharedCircuitRow = {
  id: 'shared-1',
  user_id: 'user-1',
  username: 'alice',
  name: 'Bell state',
  circuit: { numBits: 2, ops: [] },
  thumbnail_key: 'user-1/shared-1/thumb.png',
  shared: true,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
};

const privateCircuitRow = {
  id: 'private-1',
  user_id: 'user-2',
  username: 'bob',
  name: 'Secret circuit',
  circuit: { numBits: 2, ops: [] },
  thumbnail_key: null,
  shared: false,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
};

function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('marketplace routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only shared circuits without authentication', async () => {
    mockQueries({
      'WHERE c.shared = TRUE': () => ({ rows: [sharedCircuitRow] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/marketplace' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.circuits).toHaveLength(1);
    expect(body.circuits[0]).toMatchObject({
      id: 'shared-1',
      name: 'Bell state',
      username: 'alice',
      shared: true,
      thumbnailUrl: '/auth/marketplace/shared-1/thumbnail',
    });
    await app.close();
  });

  it('returns a shared circuit by id without authentication', async () => {
    mockQueries({
      'c.id = $1 AND c.shared = TRUE': () => ({ rows: [sharedCircuitRow] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/marketplace/shared-1' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.circuit).toMatchObject({
      id: 'shared-1',
      username: 'alice',
      shared: true,
    });
    await app.close();
  });

  it('returns 404 for private or missing circuits', async () => {
    mockQueries({
      'c.id = $1 AND c.shared = TRUE': () => ({ rows: [] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/marketplace/private-1' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns a shared circuit thumbnail without authentication', async () => {
    mockQueries({
      'WHERE id = $1 AND shared = TRUE': () => ({ rows: [{ thumbnail_key: 'shared/thumb.png' }] }),
    });
    getObjectMock.mockResolvedValue(Buffer.from('image'));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/marketplace/shared-1/thumbnail' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    await app.close();
  });
});

describe('circuit sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const SESSION_USER = { id: 'user-1', username: 'alice', pfp_key: null };
  const AUTH_COOKIE = 'sessionId=test-session';

  function withSession(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }> = {}) {
    mockQueries({ 'FROM sessions': () => ({ rows: [SESSION_USER] }), ...handlers });
  }

  it('updates the shared flag on a circuit', async () => {
    withSession({
      'FROM circuits WHERE id': () => ({ rows: [privateCircuitRow] }),
      'UPDATE circuits': () => ({
        rows: [{ ...privateCircuitRow, shared: true }],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/circuits/private-1',
      headers: { cookie: AUTH_COOKIE },
      payload: { shared: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.circuit.shared).toBe(true);
    await app.close();
  });
});
