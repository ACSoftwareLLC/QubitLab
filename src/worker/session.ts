import type { D1Database } from '@cloudflare/workers-types';
import type { HonoContext, SessionUser } from './types.js';
import { queryFirst } from './db.js';

export function getSessionId(c: HonoContext): string | null {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)sessionId=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getSessionUser(c: HonoContext): Promise<SessionUser | null> {
  const sessionId = getSessionId(c);
  if (!sessionId) return null;

  const now = new Date().toISOString();
  const row = await queryFirst<
    {
      id: string;
      username: string;
      pfp_key: string | null;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
    }
  >(
    c,
    `SELECT u.id, u.username, u.pfp_key, u.first_name, u.last_name, u.bio
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, now]
  );

  if (!row) return null;

  const adminList = c.env.ADMINS.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    id: row.id,
    username: row.username,
    pfp_key: row.pfp_key,
    first_name: row.first_name,
    last_name: row.last_name,
    bio: row.bio,
    isAdmin: adminList.includes(row.username),
  };
}

export async function loadSessionMiddleware(c: HonoContext, next: () => Promise<void>) {
  c.set('user', await getSessionUser(c));
  await next();
}

export async function deleteExpiredSessions(db: D1Database): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .bind(now)
    .run();
  return (result.meta as { changes?: number })?.changes ?? 0;
}
