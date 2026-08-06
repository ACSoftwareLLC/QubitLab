import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdmin } from '../hooks/requireAdmin.js';
import {
  hashIp,
  hashSession,
  parseClientInfo,
  sanitizeReferrer,
  sanitizePath,
} from '../utils/analytics.js';

const daysParamSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const limitParamSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const trackBodySchema = z.object({
  type: z.enum(['page_view', 'event']),
  path: z.string().max(2048),
  sessionId: z.string().max(128),
  referrer: z.string().max(2048).optional(),
  timezone: z.string().max(128).optional(),
  language: z.string().max(64).optional(),
  country: z.string().max(128).optional(),
  screen: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function getClientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/track', async (req, reply) => {
    const body = trackBodySchema.parse(req.body);
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '');
    const clientInfo = parseClientInfo(userAgent);
    const sessionHash = hashSession(body.sessionId, ip);
    const ipHash = hashIp(ip);
    const path = sanitizePath(body.path);
    const referrer = sanitizeReferrer(body.referrer);

    const metadata = body.metadata || {};
    if (body.screen) {
      metadata.screen = body.screen;
    }

    await pool.query(
      `INSERT INTO analytics_events
       (type, path, user_id, session_hash, ip_hash, user_agent, browser, browser_version,
        os, device, device_type, country, timezone, language, referrer, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        body.type,
        path,
        req.user?.id || null,
        sessionHash,
        ipHash,
        userAgent,
        clientInfo.browser,
        clientInfo.browserVersion,
        clientInfo.os,
        clientInfo.device,
        clientInfo.deviceType,
        body.country || null,
        body.timezone || null,
        body.language || null,
        referrer,
        metadata,
      ]
    );

    return reply.code(204).send();
  });

  app.get('/summary', { preHandler: requireAdmin }, async (req) => {
    const { days } = daysParamSchema.parse(req.query);
    const since = sinceDate(days);

    const [
      viewsResult,
      visitorsResult,
      returningResult,
      newUsersResult,
      activeSessionsResult,
      circuitsResult,
      sharedCircuitsResult,
      blogsResult,
      topPageResult,
    ] = await Promise.all([
      pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM analytics_events WHERE type = $1 AND created_at >= $2',
        ['page_view', since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(DISTINCT session_hash) FROM analytics_events WHERE created_at >= $1',
        [since]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM (
          SELECT session_hash FROM analytics_events
          WHERE created_at >= $1
          GROUP BY session_hash
          HAVING COUNT(*) > 1
        ) returning_sessions`,
        [since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM users WHERE created_at >= $1',
        [since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(DISTINCT session_hash) FROM analytics_events WHERE created_at >= $1',
        [since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM circuits WHERE created_at >= $1',
        [since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM circuits WHERE shared = TRUE AND created_at >= $1',
        [since]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM blogs WHERE published = TRUE AND publish_at >= $1',
        [since]
      ),
      pool.query<{ path: string; views: string }>(
        `SELECT path, COUNT(*) as views FROM analytics_events
         WHERE type = $1 AND created_at >= $2
         GROUP BY path
         ORDER BY views DESC
         LIMIT 1`,
        ['page_view', since]
      ),
    ]);

    return {
      days,
      since: since.toISOString(),
      pageViews: Number(viewsResult.rows[0].count),
      uniqueVisitors: Number(visitorsResult.rows[0].count),
      returningVisitors: Number(returningResult.rows[0].count),
      newUsers: Number(newUsersResult.rows[0].count),
      activeSessions: Number(activeSessionsResult.rows[0].count),
      circuitsCreated: Number(circuitsResult.rows[0].count),
      sharedCircuits: Number(sharedCircuitsResult.rows[0].count),
      blogPostsPublished: Number(blogsResult.rows[0].count),
      topPage: topPageResult.rows[0]
        ? { path: topPageResult.rows[0].path, views: Number(topPageResult.rows[0].views) }
        : null,
    };
  });

  app.get('/timeseries', { preHandler: requireAdmin }, async (req) => {
    const { days } = daysParamSchema.parse(req.query);
    const since = sinceDate(days);

    const [pageViewsResult, newUsersResult] = await Promise.all([
      pool.query<{ date: string; page_views: string; unique_visitors: string }>(
        `SELECT DATE(created_at) as date,
                COUNT(*) as page_views,
                COUNT(DISTINCT session_hash) as unique_visitors
         FROM analytics_events
         WHERE type = $1 AND created_at >= $2
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        ['page_view', since]
      ),
      pool.query<{ date: string; new_users: string }>(
        `SELECT DATE(created_at) as date,
                COUNT(*) as new_users
         FROM users
         WHERE created_at >= $1
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [since]
      ),
    ]);

    const pageViews = pageViewsResult.rows.map((r) => ({
      date: r.date,
      pageViews: Number(r.page_views),
      uniqueVisitors: Number(r.unique_visitors),
    }));
    const newUsers = newUsersResult.rows.map((r) => ({
      date: r.date,
      newUsers: Number(r.new_users),
    }));

    return { days, since: since.toISOString(), pageViews, newUsers };
  });

  app.get('/geography', { preHandler: requireAdmin }, async (req) => {
    const { days } = daysParamSchema.parse(req.query);
    const since = sinceDate(days);

    const [timezones, countries, languages] = await Promise.all([
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(timezone, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY timezone
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(country, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY country
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(language, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY language
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
    ]);

    return {
      days,
      since: since.toISOString(),
      timezones: timezones.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
      countries: countries.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
      languages: languages.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
    };
  });

  app.get('/clients', { preHandler: requireAdmin }, async (req) => {
    const { days } = daysParamSchema.parse(req.query);
    const since = sinceDate(days);

    const [browsers, operatingSystems, devices] = await Promise.all([
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(browser, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY browser
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(os, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY os
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
      pool.query<{ name: string; value: number }>(
        `SELECT COALESCE(device_type, 'Unknown') as name, COUNT(*) as value
         FROM analytics_events
         WHERE created_at >= $1
         GROUP BY device_type
         ORDER BY value DESC
         LIMIT 20`,
        [since]
      ),
    ]);

    return {
      days,
      since: since.toISOString(),
      browsers: browsers.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
      os: operatingSystems.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
      devices: devices.rows.map((r) => ({ name: r.name, value: Number(r.value) })),
    };
  });

  app.get('/pages', { preHandler: requireAdmin }, async (req) => {
    const { days, limit } = limitParamSchema.parse(req.query);
    const since = sinceDate(days);

    const result = await pool.query<{ path: string; views: number; unique_visitors: number }>(
      `SELECT path,
              COUNT(*) as views,
              COUNT(DISTINCT session_hash) as unique_visitors
       FROM analytics_events
       WHERE type = $1 AND created_at >= $2
       GROUP BY path
       ORDER BY views DESC
       LIMIT $3`,
      ['page_view', since, limit]
    );

    return {
      days,
      since: since.toISOString(),
      limit,
      pages: result.rows.map((r) => ({
        path: r.path,
        views: Number(r.views),
        uniqueVisitors: Number(r.unique_visitors),
      })),
    };
  });

  app.get('/events', { preHandler: requireAdmin }, async (req) => {
    const { days, limit } = limitParamSchema.parse(req.query);
    const since = sinceDate(days);

    const result = await pool.query(
      `SELECT id, type, path, user_id, browser, os, device_type, country, timezone,
              language, referrer, created_at
       FROM analytics_events
       WHERE created_at >= $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, limit]
    );

    return {
      days,
      since: since.toISOString(),
      limit,
      events: result.rows,
    };
  });
};

export default analyticsRoutes;
