import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index.js';
import { mockExecutionCtx, makeEnv, ADMIN_COOKIE, USER_COOKIE, DEFAULT_USER } from '../test-helpers.js';

vi.mock('../password.js', async () => {
  const actual = await import('../password.js');
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('mock-hash'),
    verifyPassword: vi.fn().mockResolvedValue(false),
  };
});

const { hashPassword, verifyPassword } = await import('../password.js');

vi.mock('../turnstile.js', async () => {
  return {
    verifyTurnstileToken: vi.fn().mockResolvedValue(true),
  };
});

let uuidCounter = 0;

describe('auth routes', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1;
      return `uuid-${uuidCounter}`;
    });
    vi.mocked(hashPassword).mockResolvedValue('mock-hash');
    vi.mocked(verifyPassword).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns health status', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/health'),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns the turnstile site key', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/turnstile-sitekey'),
      makeEnv({}, DEFAULT_USER, { TURNSTILE_SITE_KEY: 'test-key' }) as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ siteKey: 'test-key' });
  });

  it('rejects missing turnstile site key with 500', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/turnstile-sitekey'),
      makeEnv({}, DEFAULT_USER, { TURNSTILE_SITE_KEY: '' }) as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(500);
  });

  it('bypasses turnstile site key when TURNSTILE_SKIP_VERIFICATION is true', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/turnstile-sitekey'),
      makeEnv({}, DEFAULT_USER, {
        TURNSTILE_SKIP_VERIFICATION: 'true',
        TURNSTILE_SITE_KEY: 'test-key',
      }) as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ siteKey: null });
  });

  it('rejects invalid registration body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ab', password: 'short', email: 'not-an-email' }),
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });

  it('rejects registration with invalid email', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob',
          email: 'not-an-email',
          password: 'password123',
        }),
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email during registration', async () => {
    const env = makeEnv({
      'INSERT INTO users': () => {
        const err = new Error('UNIQUE constraint failed: users.email');
        (err as { cause?: { error: number } }).cause = { error: 2067 };
        throw err;
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice2',
          email: 'alice@example.com',
          password: 'password123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'Email already taken',
    });
  });

  it('registers a new user and sets a session cookie', async () => {
    const env = makeEnv({
      'INSERT INTO users': () => ({ success: true }),
      'INSERT INTO sessions': () => ({ success: true }),
      'FROM users WHERE id': () => [
        { ...DEFAULT_USER, id: 'uuid-1', username: 'bob' },
      ],
    });

    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob',
          email: 'bob@example.com',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('sessionId=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    const body = (await res.json()) as { user: { username: string } };
    expect(body.user.username).toBe('bob');
  });

  it('registers without a turnstile token when bypass is enabled', async () => {
    const env = makeEnv(
      {
        'INSERT INTO users': () => ({ success: true }),
        'INSERT INTO sessions': () => ({ success: true }),
        'FROM users WHERE id': () => [
          { ...DEFAULT_USER, id: 'uuid-1', username: 'bob' },
        ],
      },
      DEFAULT_USER,
      {
        TURNSTILE_SKIP_VERIFICATION: 'true',
        TURNSTILE_SITE_KEY: 'test-key',
      }
    );

    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob',
          email: 'bob@example.com',
          password: 'password123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
  });

  it('rejects registration without a token when site key is configured', async () => {
    const env = makeEnv(
      {},
      DEFAULT_USER,
      {
        TURNSTILE_SITE_KEY: 'test-key',
      }
    );

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob',
          email: 'bob@example.com',
          password: 'password123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'Turnstile verification required',
    });
  });

  it('rejects duplicate username during registration', async () => {
    const env = makeEnv({
      'INSERT INTO users': () => {
        const err = new Error('UNIQUE constraint failed');
        (err as { cause?: { error: number } }).cause = { error: 2067 };
        throw err;
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice',
          email: 'alice@example.com',
          password: 'password123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'Username already taken',
    });
  });

  it('rejects invalid login credentials', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [DEFAULT_USER],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'wrongpass' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(401);
  });

  it('logs in and sets a session cookie', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [DEFAULT_USER],
      'INSERT INTO sessions': () => ({ success: true }),
    });
    vi.mocked(verifyPassword).mockImplementation(async (_, hash) => hash === 'hash');

    const res = await app.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string } };
    expect(body.user.username).toBe('alice');
    expect(res.headers.get('Set-Cookie')).toContain('sessionId=');
  });

  it('rejects login for banned user', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [DEFAULT_USER],
      'FROM users WHERE id': () => [
        { ...DEFAULT_USER, banned_until: '2099-01-01T00:00:00Z', banned_reason: 'Test ban' },
      ],
    });
    vi.mocked(verifyPassword).mockImplementation(async (_, hash) => hash === 'hash');

    const res = await app.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('banned');
  });

  it('rejects registration with blacklisted email', async () => {
    const env = makeEnv({
      'email FROM email_blacklist': () => [{ email: 'bad@example.com' }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'baduser',
          email: 'bad@example.com',
          password: 'password123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
  });

  it('rejects login for unknown user', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'unknown', password: 'password123' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(401);
  });

  it('logs out and clears the session cookie', async () => {
    const env = makeEnv({
      'DELETE FROM sessions': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('returns current user for /me', async () => {
    const env = makeEnv();
    const res = await app.fetch(
      new Request('http://localhost/auth/me', {
        headers: { Cookie: USER_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string } };
    expect(body.user.username).toBe('alice');
  });

  it('checks username availability', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [],
    });
    const res = await app.fetch(
      new Request('http://localhost/auth/check-username?username=newuser'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it('reports taken usernames', async () => {
    const env = makeEnv({
      'FROM users WHERE username': () => [{ id: 'user-1' }],
    });
    const res = await app.fetch(
      new Request('http://localhost/auth/check-username?username=alice'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('returns 401 for /me without session', async () => {
    const env = makeEnv({
      'FROM sessions': () => [],
    });
    const res = await app.fetch(
      new Request('http://localhost/auth/me'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(401);
  });

  it('validates origin on state-changing requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.com',
        },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
  });
});
