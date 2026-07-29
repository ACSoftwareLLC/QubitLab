import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

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
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;

const SESSION_USER = { id: 'user-1', username: 'alice', pfp_key: null };
const AUTH_COOKIE = 'sessionId=test-session';

function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows: unknown[] }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('account routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a wrong current password with 403', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [SESSION_USER] }),
      'SELECT password_hash': () => ({
        rows: [{ password_hash: bcrypt.hashSync('right-password', 10) }],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/account/password',
      headers: { cookie: AUTH_COOKIE },
      payload: { currentPassword: 'wrong-password', newPassword: 'new-password-1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Current password is incorrect');
    await app.close();
  });

  it('updates the password and kills other sessions', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [SESSION_USER] }),
      'SELECT password_hash': () => ({
        rows: [{ password_hash: bcrypt.hashSync('right-password', 10) }],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/account/password',
      headers: { cookie: AUTH_COOKIE },
      payload: { currentPassword: 'right-password', newPassword: 'new-password-1' },
    });

    expect(res.statusCode).toBe(200);
    const killSessions = queryMock.mock.calls.find((call) =>
      (call[0] as string).includes('DELETE FROM sessions WHERE user_id')
    );
    expect(killSessions).toBeDefined();
    expect(killSessions![1]).toEqual(['user-1', 'test-session']);
    await app.close();
  });

  it('maps a duplicate username to 409', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [SESSION_USER] }),
      'UPDATE users SET username': () => {
        const err = new Error('duplicate key') as Error & { code: string };
        err.code = '23505';
        throw err;
      },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/account/username',
      headers: { cookie: AUTH_COOKIE },
      payload: { username: 'taken_name' },
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
