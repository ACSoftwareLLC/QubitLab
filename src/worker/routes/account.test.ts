import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index.js';
import { mockExecutionCtx, makeEnv, ADMIN_COOKIE, DEFAULT_USER } from '../test-helpers.js';

vi.mock('../password.js', async () => {
  const actual = await import('../password.js');
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('new-mock-hash'),
    verifyPassword: vi.fn().mockResolvedValue(false),
  };
});

const { hashPassword, verifyPassword } = await import('../password.js');

let uuidCounter = 0;

describe('account routes', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1;
      return `uuid-${uuidCounter}`;
    });
    vi.mocked(hashPassword).mockResolvedValue('new-mock-hash');
    vi.mocked(verifyPassword).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/account/username'),
      makeEnv({ 'FROM sessions': () => [] }) as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });

  it('updates the username', async () => {
    const env = makeEnv({
      'UPDATE users SET username': () => [
        { ...DEFAULT_USER, username: 'newalice' },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/account/username', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newalice' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string } };
    expect(body.user.username).toBe('newalice');
  });

  it('rejects duplicate username', async () => {
    const env = makeEnv({
      'UPDATE users SET username': () => {
        const err = new Error('UNIQUE constraint failed');
        (err as { cause?: { error: number } }).cause = { error: 2067 };
        throw err;
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/account/username', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newalice' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'Username already taken',
    });
  });

  it('changes the password and invalidates other sessions', async () => {
    const env = makeEnv({
      'SELECT password_hash FROM users WHERE id': () => [{ password_hash: 'old-hash' }],
      'UPDATE users SET password_hash': () => ({ success: true }),
      'DELETE FROM sessions WHERE user_id': () => ({ success: true }),
    });
    vi.mocked(verifyPassword).mockImplementation(async (pwd) => pwd === 'currentPassword');

    const res = await app.fetch(
      new Request('http://localhost/auth/account/password', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'currentPassword',
          newPassword: 'newPassword123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });
    expect(env.DB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
    );
  });

  it('rejects password change when current password is wrong', async () => {
    const env = makeEnv({
      'SELECT password_hash FROM users WHERE id': () => [{ password_hash: 'old-hash' }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/account/password', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'wrong',
          newPassword: 'newPassword123',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(403);
  });

  it('updates the profile', async () => {
    const env = makeEnv({
      'SET first_name': () => [
        {
          ...DEFAULT_USER,
          first_name: 'Alice',
          last_name: 'Admin',
          bio: 'Hello world',
        },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/account/profile', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Admin',
          bio: 'Hello world',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { firstName: string; lastName: string; bio: string } };
    expect(body.user.firstName).toBe('Alice');
    expect(body.user.lastName).toBe('Admin');
    expect(body.user.bio).toBe('Hello world');
  });

  it('returns 401 for unauthenticated avatar requests', async () => {
    const env = makeEnv({ 'FROM sessions': () => [] });
    const res = await app.fetch(
      new Request('http://localhost/auth/account/avatar', { method: 'POST' }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });
});

// Avatar upload and display are exercised in Playwright end-to-end tests because
// jsdom's Request.formData() implementation does not reliably parse multipart
// bodies in the same way as real browsers. The R2 upload helper is covered in
// src/worker/r2.test.ts and the avatar route is exercised in e2e/auth.spec.ts.
