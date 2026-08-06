import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgres://localhost:5432/quantum_auth',
    sessionSecret: 'dev-secret-change-me',
    cookieSecure: false,
    nodeEnv: 'development',
    admins: [],
    turnstile: {
      siteKey: 'test-site-key',
      secretKey: 'test-secret-key',
    },
    minio: {
      endpoint: 'localhost',
      port: 9000,
      useSsl: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucketAvatars: 'avatars',
      bucketThumbnails: 'circuit-thumbnails',
    },
  },
}));

vi.mock('../utils/turnstile.js', () => ({
  verifyTurnstileToken: vi.fn(),
}));

import { pool } from '../db.js';
import { verifyTurnstileToken } from '../utils/turnstile.js';
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;
const verifyMock = verifyTurnstileToken as unknown as ReturnType<typeof vi.fn>;

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
  password_hash: 'hashed',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  created_at: '2026-08-01T00:00:00Z',
};

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the turnstile site key', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/turnstile-sitekey' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ siteKey: 'test-site-key' });
    await app.close();
  });

  it('rejects registration when turnstile token is missing and secret key is configured', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Turnstile verification required' });
    expect(verifyMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects registration when turnstile verification fails', async () => {
    verifyMock.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123', turnstileToken: 'bad-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Turnstile verification failed' });
    expect(verifyMock).toHaveBeenCalledWith('bad-token');
    await app.close();
  });

  it('registers a user when turnstile verification succeeds', async () => {
    verifyMock.mockResolvedValue(true);
    mockQueries({
      'INSERT INTO users': () => ({ rows: [USER_ROW] }),
      'INSERT INTO sessions': () => ({ rows: [] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123', turnstileToken: 'good-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      id: 'user-1',
      username: 'alice',
      displayName: 'alice',
    });
    expect(verifyMock).toHaveBeenCalledWith('good-token');
    await app.close();
  });

  it('returns 409 for duplicate username during registration', async () => {
    verifyMock.mockResolvedValue(true);
    const err = new Error('duplicate') as Error & { code: string };
    err.code = '23505';
    queryMock.mockRejectedValue(err);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123', turnstileToken: 'good-token' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Username already taken' });
    await app.close();
  });
});
