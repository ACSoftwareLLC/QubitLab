import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgres://localhost:5432/quantum_auth',
    sessionSecret: 'test-secret-must-be-at-least-32-characters-long',
    cookieSecure: false,
    nodeEnv: 'test',
    admins: ['@alex'],
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

import { pool } from '../db.js';
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;

const ADMIN_USER = { id: 'user-1', username: '@alex', pfp_key: null };
const NON_ADMIN_USER = { id: 'user-2', username: 'bob', pfp_key: null };
const ADMIN_COOKIE = 'sessionId=admin-session-id';
const USER_COOKIE = 'sessionId=user-session-id';

function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows?: unknown[]; rowCount?: number }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) {
        const result = handler(params);
        return Promise.resolve({ rows: [], rowCount: 0, ...result });
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

function mockSessionUser(user: { id: string; username: string; pfp_key: string | null } | null) {
  mockQueries({
    'FROM sessions s': () => ({ rows: user ? [user] : [] }),
  });
}

describe('analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks a page view for an anonymous visitor', async () => {
    mockSessionUser(ADMIN_USER);
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO analytics_events')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/analytics/track',
      payload: {
        type: 'page_view',
        path: '/marketplace',
        sessionId: 'anon-session',
        timezone: 'Europe/Berlin',
        language: 'en-US',
      },
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    expect(res.statusCode).toBe(204);
    const insertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO analytics_events')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as string[];
    expect(params[0]).toBe('page_view');
    expect(params[1]).toBe('/marketplace');
    expect(params[2]).toBeNull(); // user_id
    await app.close();
  });

  it('tracks a page view for a logged-in user', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM sessions s')) {
        return Promise.resolve({ rows: [ADMIN_USER] });
      }
      if (sql.includes('INSERT INTO analytics_events')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/analytics/track',
      payload: {
        type: 'page_view',
        path: '/home',
        sessionId: 'user-session',
      },
      headers: {
        cookie: ADMIN_COOKIE,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    expect(res.statusCode).toBe(204);
    const insertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO analytics_events')
    );
    const params = insertCall![1] as (string | null)[];
    expect(params[2]).toBe(ADMIN_USER.id);
    await app.close();
  });

  it('rejects analytics summary for non-admin users', async () => {
    mockSessionUser(NON_ADMIN_USER);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/summary',
      headers: { cookie: USER_COOKIE },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects analytics summary for anonymous visitors', async () => {
    mockSessionUser(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/summary',
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns summary for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'COUNT(*) FROM analytics_events WHERE type': () => ({ rows: [{ count: '42' }] }),
      'COUNT(DISTINCT session_hash) FROM analytics_events WHERE created_at': () => ({ rows: [{ count: '30' }] }),
      'returning_sessions': () => ({ rows: [{ count: '12' }] }),
      'COUNT(*) FROM users WHERE created_at': () => ({ rows: [{ count: '5' }] }),
      'COUNT(*) FROM circuits WHERE created_at': () => ({ rows: [{ count: '8' }] }),
      'COUNT(*) FROM circuits WHERE shared': () => ({ rows: [{ count: '2' }] }),
      'COUNT(*) FROM blogs WHERE published': () => ({ rows: [{ count: '3' }] }),
      'GROUP BY path': () => ({ rows: [{ path: '/home', views: '20' }] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/summary',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pageViews).toBe(42);
    expect(body.uniqueVisitors).toBe(30);
    expect(body.returningVisitors).toBe(12);
    expect(body.newUsers).toBe(5);
    expect(body.circuitsCreated).toBe(8);
    expect(body.sharedCircuits).toBe(2);
    expect(body.blogPostsPublished).toBe(3);
    expect(body.topPage).toEqual({ path: '/home', views: 20 });
    await app.close();
  });

  it('returns timeseries for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'COUNT(DISTINCT session_hash) as unique_visitors': () => ({
        rows: [
          { date: '2026-08-01', page_views: '10', unique_visitors: '8' },
          { date: '2026-08-02', page_views: '12', unique_visitors: '9' },
        ],
      }),
      'as new_users': () => ({
        rows: [{ date: '2026-08-01', new_users: '2' }],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/timeseries',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pageViews).toHaveLength(2);
    expect(body.pageViews[0].pageViews).toBe(10);
    expect(body.pageViews[0].uniqueVisitors).toBe(8);
    expect(body.newUsers[0].newUsers).toBe(2);
    await app.close();
  });

  it('returns geography breakdown for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'COALESCE(timezone': () => ({
        rows: [
          { name: 'Europe/Berlin', value: 10 },
          { name: 'America/New_York', value: 5 },
        ],
      }),
      'COALESCE(country': () => ({ rows: [{ name: 'Unknown', value: 15 }] }),
      'COALESCE(language': () => ({
        rows: [
          { name: 'en-US', value: 12 },
          { name: 'de-DE', value: 3 },
        ],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/geography',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.timezones[0].name).toBe('Europe/Berlin');
    expect(body.languages[0].name).toBe('en-US');
    await app.close();
  });

  it('returns client breakdown for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'COALESCE(browser': () => ({
        rows: [
          { name: 'Chrome', value: 20 },
          { name: 'Firefox', value: 5 },
        ],
      }),
      'COALESCE(os': () => ({
        rows: [
          { name: 'Linux', value: 12 },
          { name: 'Windows', value: 8 },
        ],
      }),
      'COALESCE(device_type': () => ({
        rows: [
          { name: 'desktop', value: 18 },
          { name: 'mobile', value: 2 },
        ],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/clients',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.browsers[0].name).toBe('Chrome');
    expect(body.os[0].name).toBe('Linux');
    expect(body.devices[0].name).toBe('desktop');
    await app.close();
  });

  it('returns top pages for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'ORDER BY views DESC': () => ({
        rows: [
          { path: '/home', views: 20, unique_visitors: 15 },
          { path: '/editor', views: 10, unique_visitors: 8 },
        ],
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/pages',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0].path).toBe('/home');
    expect(body.pages[0].views).toBe(20);
    await app.close();
  });

  it('returns recent events for admins', async () => {
    mockSessionUser(ADMIN_USER);
    mockQueries({
      'FROM sessions s': () => ({ rows: [ADMIN_USER] }),
      'LIMIT $2': () => ({
        rows: [
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
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/analytics/events',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].path).toBe('/home');
    await app.close();
  });
});
