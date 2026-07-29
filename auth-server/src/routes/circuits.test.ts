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
const putObjectMock = minioClient.putObject as unknown as ReturnType<typeof vi.fn>;

const SESSION_USER = { id: 'user-1', username: 'alice', pfp_key: null };
const AUTH_COOKIE = 'sessionId=test-session';

const validCircuitBody = {
  name: 'Bell state',
  circuit: {
    numBits: 2,
    ops: [{ id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null }],
  },
};

/** Routes pool.query by SQL fragment; individual tests extend via mockImplementation. */
function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

function withSession(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }> = {}) {
  mockQueries({ 'FROM sessions': () => ({ rows: [SESSION_USER] }), ...handlers });
}

describe('circuit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/circuits' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('lists the user\'s circuits with thumbnail URLs', async () => {
    withSession({
      'FROM circuits WHERE user_id': () => ({
        rows: [
          {
            id: 'c1',
            user_id: 'user-1',
            name: 'Bell state',
            circuit: validCircuitBody.circuit,
            thumbnail_key: 'user-1/c1/thumb.png',
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-02T00:00:00Z',
          },
        ],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/circuits',
      headers: { cookie: AUTH_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.circuits).toHaveLength(1);
    expect(body.circuits[0]).toMatchObject({
      id: 'c1',
      name: 'Bell state',
      username: 'alice',
      thumbnailUrl: '/auth/circuits/c1/thumbnail',
    });
    await app.close();
  });

  it('scopes circuit lookup to the owner and 404s otherwise', async () => {
    withSession({ 'FROM circuits WHERE id': () => ({ rows: [] }) });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/circuits/not-mine',
      headers: { cookie: AUTH_COOKIE },
    });

    expect(res.statusCode).toBe(404);
    // The ownership filter must include the user id.
    const ownershipQuery = queryMock.mock.calls.find((call) =>
      (call[0] as string).includes('FROM circuits WHERE id')
    );
    expect(ownershipQuery).toBeDefined();
    expect(ownershipQuery![1]).toEqual(['not-mine', 'user-1']);
    await app.close();
  });

  it('creates a circuit and stores a valid PNG thumbnail', async () => {
    const pngDataUrl =
      'data:image/png;base64,' +
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

    withSession({
      'INSERT INTO circuits': () => ({
        rows: [
          {
            id: 'new-id',
            user_id: 'user-1',
            name: validCircuitBody.name,
            circuit: validCircuitBody.circuit,
            thumbnail_key: 'user-1/new-id/x.png',
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/circuits',
      headers: { cookie: AUTH_COOKIE },
      payload: { ...validCircuitBody, thumbnail: pngDataUrl },
    });

    expect(res.statusCode).toBe(201);
    expect(putObjectMock).toHaveBeenCalledOnce();
    expect(putObjectMock.mock.calls[0][0]).toBe('circuit-thumbnails');
    await app.close();
  });

  it('rejects a thumbnail that is not a PNG', async () => {
    withSession();
    const notPng = 'data:image/png;base64,' + Buffer.from('not an image').toString('base64');

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/circuits',
      headers: { cookie: AUTH_COOKIE },
      payload: { ...validCircuitBody, thumbnail: notPng },
    });

    expect(res.statusCode).toBe(400);
    expect(putObjectMock).not.toHaveBeenCalled();
    await app.close();
  });
});
