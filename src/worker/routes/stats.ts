import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { queryFirst } from '../db.js';

const stats = new Hono<HonoEnv>();

stats.get('/', async (c) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const users = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM users`
  );
  const circuits = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM circuits`
  );
  const shared = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM circuits WHERE shared = 1`
  );
  const sharedThisWeek = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM circuits WHERE shared = 1 AND shared_at > ?`,
    [since]
  );

  return c.json({
    users: users?.count ?? 0,
    circuits: circuits?.count ?? 0,
    shared: shared?.count ?? 0,
    sharedThisWeek: sharedThisWeek?.count ?? 0,
  });
});

export default stats;
