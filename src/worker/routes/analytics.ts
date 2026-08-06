import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import {
  analyticsDaysParamSchema,
  analyticsLimitParamSchema,
  analyticsTrackBodySchema,
} from '../schemas.js';
import { queryAll } from '../db.js';
import { requireAdmin } from '../auth.js';
import { recordAnalyticsTrackEvent } from '../analytics.js';

const analytics = new Hono<HonoEnv>();

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

analytics.post('/track', async (c) => {
  const body = await c.req.json();
  const result = analyticsTrackBodySchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  c.executionCtx.waitUntil(recordAnalyticsTrackEvent(c, result.data).catch(() => {}));
  return new Response(null, { status: 204 });
});

analytics.use(requireAdmin);

analytics.get('/summary', async (c) => {
  const query = c.req.query();
  const parsed = analyticsDaysParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days } = parsed.data;
  const since = sinceDate(days);

  const weekSince = sinceDate(7);

  const [
    viewsRows,
    visitorsRows,
    returningRows,
    newUsersRows,
    activeSessionsRows,
    circuitsRows,
    sharedCircuitsRows,
    blogsRows,
    topPageRows,
    totalUsersRows,
    totalCircuitsRows,
    totalSharedRows,
    sharedThisWeekRows,
  ] = await Promise.all([
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM analytics_events WHERE type = ? AND created_at >= ?`,
      ['page_view', since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(DISTINCT session_hash) as count FROM analytics_events WHERE created_at >= ?`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM (
        SELECT session_hash FROM analytics_events
        WHERE created_at >= ?
        GROUP BY session_hash
        HAVING COUNT(*) > 1
      ) returning_sessions`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM users WHERE created_at >= ?`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(DISTINCT session_hash) as count FROM analytics_events WHERE created_at >= ?`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM circuits WHERE created_at >= ?`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM circuits WHERE shared = 1 AND created_at >= ?`,
      [since]
    ),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM blogs WHERE published = 1 AND publish_at >= ?`,
      [since]
    ),
    queryAll<{ path: string; views: number }>(
      c,
      `SELECT path, COUNT(*) as views FROM analytics_events
       WHERE type = ? AND created_at >= ?
       GROUP BY path
       ORDER BY views DESC
       LIMIT 1`,
      ['page_view', since]
    ),
    queryAll<{ count: number }>(c, `SELECT COUNT(*) as count FROM users`),
    queryAll<{ count: number }>(c, `SELECT COUNT(*) as count FROM circuits`),
    queryAll<{ count: number }>(c, `SELECT COUNT(*) as count FROM circuits WHERE shared = 1`),
    queryAll<{ count: number }>(
      c,
      `SELECT COUNT(*) as count FROM circuits WHERE shared = 1 AND shared_at >= ?`,
      [weekSince]
    ),
  ]);

  return c.json({
    days,
    since,
    pageViews: Number(viewsRows[0]?.count ?? 0),
    uniqueVisitors: Number(visitorsRows[0]?.count ?? 0),
    returningVisitors: Number(returningRows[0]?.count ?? 0),
    newUsers: Number(newUsersRows[0]?.count ?? 0),
    activeSessions: Number(activeSessionsRows[0]?.count ?? 0),
    circuitsCreated: Number(circuitsRows[0]?.count ?? 0),
    sharedCircuits: Number(sharedCircuitsRows[0]?.count ?? 0),
    blogPostsPublished: Number(blogsRows[0]?.count ?? 0),
    topPage: topPageRows[0]
      ? { path: topPageRows[0].path, views: Number(topPageRows[0].views) }
      : null,
    totalUsers: Number(totalUsersRows[0]?.count ?? 0),
    totalCircuits: Number(totalCircuitsRows[0]?.count ?? 0),
    totalShared: Number(totalSharedRows[0]?.count ?? 0),
    sharedThisWeek: Number(sharedThisWeekRows[0]?.count ?? 0),
  });
});

analytics.get('/timeseries', async (c) => {
  const query = c.req.query();
  const parsed = analyticsDaysParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days } = parsed.data;
  const since = sinceDate(days);

  const [pageViewsRows, newUsersRows, circuitsRows, sharedRows] = await Promise.all([
    queryAll<{ date: string; page_views: number; unique_visitors: number }>(
      c,
      `SELECT date(created_at) as date,
              COUNT(*) as page_views,
              COUNT(DISTINCT session_hash) as unique_visitors
       FROM analytics_events
       WHERE type = ? AND created_at >= ?
       GROUP BY date(created_at)
       ORDER BY date ASC`,
      ['page_view', since]
    ),
    queryAll<{ date: string; new_users: number }>(
      c,
      `SELECT date(created_at) as date,
              COUNT(*) as new_users
       FROM users
       WHERE created_at >= ?
       GROUP BY date(created_at)
       ORDER BY date ASC`,
      [since]
    ),
    queryAll<{ date: string; circuits: number }>(
      c,
      `SELECT date(created_at) as date,
              COUNT(*) as circuits
       FROM circuits
       WHERE created_at >= ?
       GROUP BY date(created_at)
       ORDER BY date ASC`,
      [since]
    ),
    queryAll<{ date: string; shared: number }>(
      c,
      `SELECT date(shared_at) as date,
              COUNT(*) as shared
       FROM circuits
       WHERE shared = 1 AND shared_at >= ?
       GROUP BY date(shared_at)
       ORDER BY date ASC`,
      [since]
    ),
  ]);

  return c.json({
    days,
    since,
    pageViews: pageViewsRows.map((r) => ({
      date: r.date,
      pageViews: Number(r.page_views),
      uniqueVisitors: Number(r.unique_visitors),
    })),
    newUsers: newUsersRows.map((r) => ({
      date: r.date,
      newUsers: Number(r.new_users),
    })),
    circuitsCreated: circuitsRows.map((r) => ({
      date: r.date,
      circuits: Number(r.circuits),
    })),
    sharedCircuits: sharedRows.map((r) => ({
      date: r.date,
      shared: Number(r.shared),
    })),
  });
});

analytics.get('/geography', async (c) => {
  const query = c.req.query();
  const parsed = analyticsDaysParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days } = parsed.data;
  const since = sinceDate(days);

  const [timezones, countries, languages] = await Promise.all([
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(timezone, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY timezone
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(country, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY country
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(language, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY language
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
  ]);

  return c.json({
    days,
    since,
    timezones: timezones.map((r) => ({ name: r.name, value: Number(r.value) })),
    countries: countries.map((r) => ({ name: r.name, value: Number(r.value) })),
    languages: languages.map((r) => ({ name: r.name, value: Number(r.value) })),
  });
});

analytics.get('/clients', async (c) => {
  const query = c.req.query();
  const parsed = analyticsDaysParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days } = parsed.data;
  const since = sinceDate(days);

  const [browsers, operatingSystems, devices] = await Promise.all([
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(browser, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY browser
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(os, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY os
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
    queryAll<{ name: string; value: number }>(
      c,
      `SELECT COALESCE(device_type, 'Unknown') as name, COUNT(*) as value
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY device_type
       ORDER BY value DESC
       LIMIT 20`,
      [since]
    ),
  ]);

  return c.json({
    days,
    since,
    browsers: browsers.map((r) => ({ name: r.name, value: Number(r.value) })),
    os: operatingSystems.map((r) => ({ name: r.name, value: Number(r.value) })),
    devices: devices.map((r) => ({ name: r.name, value: Number(r.value) })),
  });
});

analytics.get('/pages', async (c) => {
  const query = c.req.query();
  const parsed = analyticsLimitParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days, limit } = parsed.data;
  const since = sinceDate(days);

  const rows = await queryAll<{ path: string; views: number; unique_visitors: number }>(
    c,
    `SELECT path,
            COUNT(*) as views,
            COUNT(DISTINCT session_hash) as unique_visitors
     FROM analytics_events
     WHERE type = ? AND created_at >= ?
     GROUP BY path
     ORDER BY views DESC
     LIMIT ?`,
    ['page_view', since, limit]
  );

  return c.json({
    days,
    since,
    limit,
    pages: rows.map((r) => ({
      path: r.path,
      views: Number(r.views),
      uniqueVisitors: Number(r.unique_visitors),
    })),
  });
});

analytics.get('/events', async (c) => {
  const query = c.req.query();
  const parsed = analyticsLimitParamSchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { days, limit } = parsed.data;
  const since = sinceDate(days);

  const rows = await queryAll<
    Record<string, unknown>
  >(
    c,
    `SELECT id, type, path, user_id, browser, os, device_type, country, timezone,
            language, referrer, created_at
     FROM analytics_events
     WHERE created_at >= ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [since, limit]
  );

  return c.json({
    days,
    since,
    limit,
    events: rows,
  });
});

export default analytics;
