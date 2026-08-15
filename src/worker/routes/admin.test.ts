import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index.js';
import { mockExecutionCtx, makeEnv, makeAdminEnv, ADMIN_COOKIE, USER_COOKIE, DEFAULT_USER } from '../test-helpers.js';

let uuidCounter = 0;

describe('admin routes', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1;
      return `uuid-${uuidCounter}`;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-admins', async () => {
    const env = makeEnv({}, DEFAULT_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?search=alice', {
        headers: { Cookie: USER_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(403);
  });

  it('rejects users whose username matches the old ADMINS env but DB flag is false', async () => {
    const env = makeEnv(
      {},
      { ...DEFAULT_USER, username: 'alex', is_admin: 0 }
    );
    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?search=alice', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const env = makeEnv({}, DEFAULT_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?search=alice'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });

  it('searches users by username or email', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 1 }],
      'LIKE ? ESCAPE': () => [
        { id: 'user-2', username: 'bob', email: 'bob@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-01T00:00:00Z', banned_until: null, banned_reason: null },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?search=bob', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { username: string; email: string }[]; total: number; page: number; limit: number };
    expect(body.users).toHaveLength(1);
    expect(body.users[0].username).toBe('bob');
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('lists all users when search is omitted', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 2 }],
      'ORDER BY created_at': () => [
        { id: 'user-3', username: 'carol', email: 'carol@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-03T00:00:00Z', banned_until: null, banned_reason: null },
        { id: 'user-2', username: 'bob', email: 'bob@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-02T00:00:00Z', banned_until: null, banned_reason: null },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { username: string; createdAt: string }[]; total: number };
    expect(body.users).toHaveLength(2);
    expect(body.users[0].username).toBe('carol');
    expect(body.total).toBe(2);
  });

  it('defaults to most recent signups', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 2 }],
      'ORDER BY created_at': (_sql: string, params: unknown[]) => {
        expect(params).toContain(20);
        expect(params).toContain(0);
        return [
          { id: 'user-2', username: 'bob', email: 'bob@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-02T00:00:00Z', banned_until: null, banned_reason: null },
          { id: 'user-1', username: 'alice', email: 'alice@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-01T00:00:00Z', banned_until: null, banned_reason: null },
        ];
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { username: string; createdAt: string }[] };
    expect(body.users[0].username).toBe('bob');
  });

  it('sorts alphabetically when requested', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 2 }],
      'ORDER BY username': (_sql: string, params: unknown[]) => {
        expect(params).toContain(20);
        expect(params).toContain(0);
        return [
          { id: 'user-1', username: 'alice', email: 'alice@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-02T00:00:00Z', banned_until: null, banned_reason: null },
          { id: 'user-2', username: 'bob', email: 'bob@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-01T00:00:00Z', banned_until: null, banned_reason: null },
        ];
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?sort=username&order=asc', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { username: string }[] };
    expect(body.users.map((u) => u.username)).toEqual(['alice', 'bob']);
  });

  it('paginates with limit and offset', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 15 }],
      'ORDER BY created_at': (_sql: string, params: unknown[]) => {
        expect(params).toContain(10);
        expect(params).toContain(10);
        return [
          { id: 'user-2', username: 'bob', email: 'bob@example.com', first_name: null, last_name: null, bio: null, pfp_key: null, created_at: '2026-07-02T00:00:00Z', banned_until: null, banned_reason: null },
        ];
      },
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?page=2&limit=10', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { username: string }[]; total: number; page: number; limit: number };
    expect(body.users).toHaveLength(1);
    expect(body.users[0].username).toBe('bob');
    expect(body.total).toBe(15);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
  });

  it('accepts 10, 20, 50, and 100 per page', async () => {
    const env = makeAdminEnv({
      'COUNT(*) AS count': () => [{ count: 0 }],
      'ORDER BY created_at': () => [],
    });

    for (const limit of [10, 20, 50, 100]) {
      const res = await app.fetch(
        new Request(`http://localhost/auth/admin/users?limit=${limit}`, {
          headers: { Cookie: ADMIN_COOKIE },
        }),
        env as unknown as Record<string, unknown>,
        mockExecutionCtx()
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { limit: number };
      expect(body.limit).toBe(limit);
    }
  });

  it('rejects invalid limit values', async () => {
    const env = makeAdminEnv();
    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users?limit=200', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });

  it('bans a user for a duration and logs the action', async () => {
    const env = makeAdminEnv({
      'FROM users WHERE id': (_sql, params) => {
        if (params[0] === 'user-2') return [{ username: 'bob', email: 'bob@example.com' }];
        return [{ ...DEFAULT_USER, username: 'alex', is_admin: 1 }];
      },
      'UPDATE users SET banned_until': () => ({ success: true }),
      'DELETE FROM sessions WHERE user_id': () => ({ success: true }),
      'INSERT INTO email_blacklist': () => ({ success: true }),
      'INSERT INTO admin_actions': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-2/ban', {
        method: 'POST',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Spam and abuse', durationDays: 7 }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; permanent: boolean; blacklistedEmail: boolean };
    expect(body.success).toBe(true);
    expect(body.permanent).toBe(false);
    expect(body.blacklistedEmail).toBe(true);
  });

  it('bans a user permanently', async () => {
    const env = makeAdminEnv({
      'FROM users WHERE id': (_sql, params) => {
        if (params[0] === 'user-2') return [{ username: 'bob', email: 'bob@example.com' }];
        return [{ ...DEFAULT_USER, username: 'alex', is_admin: 1 }];
      },
      'UPDATE users SET banned_until': () => ({ success: true }),
      'DELETE FROM sessions WHERE user_id': () => ({ success: true }),
      'INSERT INTO email_blacklist': () => ({ success: true }),
      'INSERT INTO admin_actions': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-2/ban', {
        method: 'POST',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Abuse', durationDays: 0 }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; permanent: boolean; bannedUntil: string };
    expect(body.permanent).toBe(true);
    expect(body.bannedUntil).toBe('9999-12-31T23:59:59.999Z');
  });

  it('unbans a user', async () => {
    const env = makeAdminEnv({
      'FROM users WHERE id': (_sql, params) => {
        if (params[0] === 'user-2') return [{ username: 'bob', email: 'bob@example.com', banned_until: '2027-01-01T00:00:00Z' }];
        return [{ ...DEFAULT_USER, username: 'alex', is_admin: 1 }];
      },
      'UPDATE users SET banned_until = NULL': () => ({ success: true }),
      'DELETE FROM email_blacklist WHERE email': () => ({ success: true }),
      'INSERT INTO admin_actions': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-2/unban', {
        method: 'POST',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Appeal accepted', removeBlacklist: true }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; removedBlacklist: boolean };
    expect(body.success).toBe(true);
    expect(body.removedBlacklist).toBe(true);
  });

  it('deletes a user and cleans up R2 assets', async () => {
    const r2Delete = vi.fn().mockResolvedValue(undefined);
    const env = makeAdminEnv(
      {
        'FROM users WHERE id': (_sql, params) => {
          if (params[0] === 'user-2') return [{ username: 'bob', email: 'bob@example.com', pfp_key: 'avatars/bob.png' }];
          return [{ ...DEFAULT_USER, username: 'alex', is_admin: 1 }];
        },
        'SELECT thumbnail_key FROM circuits WHERE user_id': () => [
          { thumbnail_key: 'thumb1.png' },
          { thumbnail_key: null },
          { thumbnail_key: 'thumb2.png' },
        ],
        'INSERT INTO admin_actions': () => ({ success: true }),
        'DELETE FROM users WHERE id': () => ({ success: true }),
      },
      { AVATARS: { delete: r2Delete } as unknown as R2Bucket }
    );

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-2', {
        method: 'DELETE',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Banned by ToS violations' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });
  });

  it('prevents self-deletion', async () => {
    const env = makeAdminEnv();

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-1', {
        method: 'DELETE',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Testing' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(400);
  });

  it('returns admin actions for a user', async () => {
    const env = makeAdminEnv({
      'aa.target_user_id = ?': () => [
        { id: 'act-1', admin_id: 'user-1', admin_username: 'alex', action: 'ban_user', reason: 'Spam', metadata: null, created_at: '2026-07-02T00:00:00Z' },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/admin/users/user-2/actions', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { actions: { action: string; adminUsername: string }[] };
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].action).toBe('ban_user');
    expect(body.actions[0].adminUsername).toBe('alex');
  });
});
