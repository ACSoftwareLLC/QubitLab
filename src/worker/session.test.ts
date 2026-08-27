import { describe, it, expect, vi } from 'vitest';
import { deleteExpiredSessions, getSessionUser, hashSessionId } from './session.js';
import type { HonoContext } from './types.js';
import { sha256Hex } from './crypto.js';

function mockContext(cookie?: string): HonoContext {
  return {
    req: {
      header: vi.fn((name: string) => (name === 'Cookie' ? cookie : undefined)),
    },
    env: { DB: {} as import('@cloudflare/workers-types').D1Database },
  } as unknown as HonoContext;
}

function mockD1(rows: unknown[]): import('@cloudflare/workers-types').D1Database {
  const prepared = {
    bind: vi.fn(() => prepared),
    first: vi.fn().mockResolvedValue(rows[0] ?? null),
  };
  return {
    prepare: vi.fn(() => prepared),
  } as unknown as import('@cloudflare/workers-types').D1Database;
}

describe('deleteExpiredSessions', () => {
  it('deletes expired sessions and returns the count', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ run })) }));
    const db = { prepare } as unknown as import('@cloudflare/workers-types').D1Database;

    const deleted = await deleteExpiredSessions(db);

    expect(deleted).toBe(3);
    expect(prepare).toHaveBeenCalledWith('DELETE FROM sessions WHERE expires_at <= ?');
  });

  it('returns zero when meta is missing', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ run })) }));
    const db = { prepare } as unknown as import('@cloudflare/workers-types').D1Database;

    const deleted = await deleteExpiredSessions(db);
    expect(deleted).toBe(0);
  });
});

describe('hashSessionId', () => {
  it('returns the SHA-256 hex digest of the session id', async () => {
    const sessionId = 'test-session-id';
    const hash = await hashSessionId(sessionId);
    expect(hash).toBe(await sha256Hex(sessionId));
    expect(hash).not.toBe(sessionId);
  });
});

describe('getSessionUser', () => {
  it('returns null when no session cookie is present', async () => {
    const c = mockContext();
    const user = await getSessionUser(c);
    expect(user).toBeNull();
  });

  it('looks up the session by the SHA-256 hash of the cookie value', async () => {
    const sessionId = 'admin-session';
    const sessionHash = await sha256Hex(sessionId);
    const c = mockContext(`sessionId=${encodeURIComponent(sessionId)}`);
    c.env.DB = mockD1([
      {
        id: 'user-1',
        username: 'alex',
        pfp_key: null,
        first_name: null,
        last_name: null,
        bio: null,
        is_admin: 1,
      },
    ]);

    const user = await getSessionUser(c);

    expect(user).not.toBeNull();
    expect(user?.username).toBe('alex');
    expect(user?.isAdmin).toBe(true);
    const prepare = c.env.DB.prepare as ReturnType<typeof vi.fn>;
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('WHERE s.id = ? AND s.expires_at > ?')
    );
    const bind = prepare.mock.results[0].value.bind as ReturnType<typeof vi.fn>;
    expect(bind.mock.calls[0][0]).toBe(sessionHash);
  });

  it('rejects a plaintext session id stored before hashing', async () => {
    const sessionId = 'old-plaintext-session';
    const c = mockContext(`sessionId=${encodeURIComponent(sessionId)}`);
    // The DB contains the plaintext session id, not its hash.
    c.env.DB = mockD1([]);

    const prepared = c.env.DB.prepare as ReturnType<typeof vi.fn>;
    prepared.mockImplementation(() => ({
      bind: vi.fn((hashedId: string) => ({
        first: vi.fn().mockResolvedValue(
          // Simulate SQLite matching the plaintext row only when the param is plaintext.
          hashedId === sessionId
            ? {
                id: 'user-1',
                username: 'alex',
                pfp_key: null,
                first_name: null,
                last_name: null,
                bio: null,
                is_admin: 1,
              }
            : null
        ),
      })),
    }));

    const user = await getSessionUser(c);
    expect(user).toBeNull();
  });

  it('sets isAdmin from the DB flag', async () => {
    const sessionId = 'user-session';
    const c = mockContext(`sessionId=${encodeURIComponent(sessionId)}`);
    c.env.DB = mockD1([
      {
        id: 'user-2',
        username: 'bob',
        pfp_key: null,
        first_name: null,
        last_name: null,
        bio: null,
        is_admin: 0,
      },
    ]);

    const user = await getSessionUser(c);
    expect(user?.isAdmin).toBe(false);
  });
});
