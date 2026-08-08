import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from '../index.js';

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
    waitUntil: vi.fn((p: Promise<unknown>) => p),
    passThroughOnException: vi.fn(),
  };
}

const ADMIN_USER = {
  id: 'user-1',
  username: 'alex',
  password_hash: 'hash',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  created_at: '2026-07-01T00:00:00Z',
};

const NON_ADMIN_USER = {
  id: 'user-2',
  username: 'bob',
  password_hash: 'hash',
  pfp_key: null,
  first_name: null,
  last_name: null,
  bio: null,
  created_at: '2026-07-01T00:00:00Z',
};

const ADMIN_COOKIE = 'sessionId=admin-session';
const USER_COOKIE = 'sessionId=user-session';

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {},
  user = ADMIN_USER,
  admins = 'alex'
) {
  return {
    DB: mockD1({
      'FROM sessions': () => [user],
      'FROM users WHERE id': () => [user],
      ...d1Handlers,
    }),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    ADMINS: admins,
  };
}

function assertSince(body: { since: string }) {
  expect(new Date(body.since).toISOString()).toBe(body.since);
}

describe('analytics routes', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-06T12:00:00Z'));
  });

  it('tracks a page view for an anonymous visitor', async () => {
    const env = makeEnv();
    const ctx = mockExecutionCtx();
    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'page_view',
          path: '/marketplace',
          sessionId: 'anon-session',
          timezone: 'Europe/Berlin',
          language: 'en-US',
        }),
      }),
      env as unknown as Record<string, unknown>,
      ctx
    );

    expect(res.status).toBe(204);
    const waitUntilCalls = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitUntilCalls.length).toBeGreaterThan(0);
    await Promise.all(waitUntilCalls.map((call) => call[0] as Promise<unknown>));

    expect(env.DB.prepare).toHaveBeenCalled();
    expect((env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
      String(call[0]).includes('INSERT INTO analytics_events')
    )).toBe(true);
  });

  it('tracks a page view for a logged-in user', async () => {
    const env = makeEnv();
    const ctx = mockExecutionCtx();
    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/track', {
        method: 'POST',
        headers: {
          Cookie: ADMIN_COOKIE,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'page_view',
          path: '/home',
          sessionId: 'user-session',
        }),
      }),
      env as unknown as Record<string, unknown>,
      ctx
    );

    expect(res.status).toBe(204);
    const waitUntilCalls = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls;
    expect(waitUntilCalls.length).toBeGreaterThan(0);
    await Promise.all(waitUntilCalls.map((call) => call[0] as Promise<unknown>));
  });

  it('rejects summary for non-admin users', async () => {
    const env = makeEnv({}, NON_ADMIN_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/summary', {
        headers: { Cookie: USER_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(403);
  });

  it('rejects summary for anonymous visitors', async () => {
    const env = makeEnv({}, NON_ADMIN_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/summary'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });

  it('returns summary for admins', async () => {
    const env = makeEnv({
      'COUNT(*) as count FROM analytics_events WHERE type': () => [{ count: 42 }],
      'COUNT(DISTINCT session_hash) as count FROM analytics_events WHERE created_at': () => [{ count: 30 }],
      'returning_sessions': () => [{ count: 12 }],
      'COUNT(*) as count FROM users WHERE created_at': () => [{ count: 5 }],
      'COUNT(*) as count FROM circuits WHERE created_at': () => [{ count: 8 }],
      'COUNT(*) as count FROM circuits WHERE shared = 1 AND shared_at': () => [{ count: 1 }],
      'COUNT(*) as count FROM circuits WHERE shared = 1': () => [{ count: 2 }],
      'COUNT(*) as count FROM circuits': () => [{ count: 25 }],
      'COUNT(*) as count FROM users': () => [{ count: 100 }],
      'COUNT(*) as count FROM blogs WHERE published': () => [{ count: 3 }],
      'GROUP BY path': () => [{ path: '/home', views: 20 }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/summary', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      days: number;
      pageViews: number;
      uniqueVisitors: number;
      returningVisitors: number;
      newUsers: number;
      activeSessions: number;
      circuitsCreated: number;
      sharedCircuits: number;
      blogPostsPublished: number;
      topPage: { path: string; views: number } | null;
      totalUsers: number;
      totalCircuits: number;
      totalShared: number;
      sharedThisWeek: number;
      since: string;
    };
    expect(body.days).toBe(30);
    expect(body.pageViews).toBe(42);
    expect(body.uniqueVisitors).toBe(30);
    expect(body.returningVisitors).toBe(12);
    expect(body.newUsers).toBe(5);
    expect(body.circuitsCreated).toBe(8);
    expect(body.sharedCircuits).toBe(2);
    expect(body.blogPostsPublished).toBe(3);
    expect(body.topPage).toEqual({ path: '/home', views: 20 });
    expect(body.totalUsers).toBe(100);
    expect(body.totalCircuits).toBe(25);
    expect(body.totalShared).toBe(2);
    expect(body.sharedThisWeek).toBe(1);
    assertSince(body);
  });

  it('returns timeseries for admins', async () => {
    const env = makeEnv({
      'COUNT(DISTINCT session_hash) as unique_visitors': () => [
        { date: '2026-08-01', page_views: 10, unique_visitors: 8 },
        { date: '2026-08-02', page_views: 12, unique_visitors: 9 },
      ],
      'as new_users': () => [{ date: '2026-08-01', new_users: 2 }],
      'as circuits': () => [
        { date: '2026-08-01', circuits: 3 },
        { date: '2026-08-02', circuits: 5 },
      ],
      'as shared': () => [{ date: '2026-08-02', shared: 1 }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/timeseries', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pageViews: { date: string; pageViews: number; uniqueVisitors: number }[];
      newUsers: { date: string; newUsers: number }[];
      circuitsCreated: { date: string; circuits: number }[];
      sharedCircuits: { date: string; shared: number }[];
      since: string;
    };
    expect(body.pageViews).toHaveLength(2);
    expect(body.pageViews[0].pageViews).toBe(10);
    expect(body.pageViews[0].uniqueVisitors).toBe(8);
    expect(body.newUsers[0].newUsers).toBe(2);
    expect(body.circuitsCreated).toHaveLength(2);
    expect(body.circuitsCreated[0].circuits).toBe(3);
    expect(body.sharedCircuits).toHaveLength(1);
    expect(body.sharedCircuits[0].shared).toBe(1);
    assertSince(body);
  });

  it('returns geography breakdown for admins', async () => {
    const env = makeEnv({
      'COALESCE(timezone': () => [
        { name: 'Europe/Berlin', value: 10 },
        { name: 'America/New_York', value: 5 },
      ],
      'COALESCE(country': () => [{ name: 'Unknown', value: 15 }],
      'COALESCE(language': () => [
        { name: 'en-US', value: 12 },
        { name: 'de-DE', value: 3 },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/geography', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timezones: { name: string; value: number }[];
      countries: { name: string; value: number }[];
      languages: { name: string; value: number }[];
      since: string;
    };
    expect(body.timezones[0].name).toBe('Europe/Berlin');
    expect(body.countries[0].name).toBe('Unknown');
    expect(body.languages[0].name).toBe('en-US');
    assertSince(body);
  });

  it('returns client breakdown for admins', async () => {
    const env = makeEnv({
      'COALESCE(browser': () => [
        { name: 'Chrome', value: 20 },
        { name: 'Firefox', value: 5 },
      ],
      'COALESCE(os': () => [
        { name: 'Linux', value: 12 },
        { name: 'Windows', value: 8 },
      ],
      'COALESCE(device_type': () => [
        { name: 'desktop', value: 18 },
        { name: 'mobile', value: 2 },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/clients', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      browsers: { name: string; value: number }[];
      os: { name: string; value: number }[];
      devices: { name: string; value: number }[];
      since: string;
    };
    expect(body.browsers[0].name).toBe('Chrome');
    expect(body.os[0].name).toBe('Linux');
    expect(body.devices[0].name).toBe('desktop');
    assertSince(body);
  });

  it('returns top pages for admins', async () => {
    const env = makeEnv({
      'ORDER BY views DESC': () => [
        { path: '/home', views: 20, unique_visitors: 15 },
        { path: '/editor', views: 10, unique_visitors: 8 },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/pages', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pages: { path: string; views: number; uniqueVisitors: number }[];
      since: string;
    };
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0].path).toBe('/home');
    expect(body.pages[0].views).toBe(20);
    assertSince(body);
  });

  it('returns recent events for admins', async () => {
    const env = makeEnv({
      'LIMIT ?': () => [
        {
          id: 'event-1',
          type: 'page_view',
          path: '/home',
          user_id: null,
          browser: 'Chrome',
          os: 'Linux',
          device_type: 'desktop',
          country: null,
          timezone: 'Europe/Berlin',
          language: 'en-US',
          referrer: null,
          created_at: '2026-08-06T12:00:00Z',
        },
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/analytics/events', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: { path: string; type: string }[];
      since: string;
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].path).toBe('/home');
    assertSince(body);
  });
});
