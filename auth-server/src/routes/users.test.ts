import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db.js';
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;

function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

const USER_ROW = {
  id: 'user-1',
  username: 'alice',
  pfp_key: null,
  first_name: 'Alice',
  last_name: 'Liddell',
  bio: 'Curiouser and curiouser.',
  created_at: '2026-08-01T00:00:00Z',
};

describe('user profile routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a public profile by username', async () => {
    mockQueries({
      'WHERE username = $1': () => ({ rows: [USER_ROW] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/users/alice' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      id: 'user-1',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Liddell',
      bio: 'Curiouser and curiouser.',
      displayName: 'Alice Liddell',
      pfpUrl: null,
      isAdmin: false,
    });
    await app.close();
  });

  it('returns 404 for an unknown username', async () => {
    mockQueries({
      'WHERE username = $1': () => ({ rows: [] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/users/nobody' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
