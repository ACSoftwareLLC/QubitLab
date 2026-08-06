import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';
import type { HonoContext } from './types.js';
import { queryFirst, runQuery } from './db.js';
import { randomUUID } from './crypto.js';

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'Unauthorized', 401);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'Unauthorized', 401);
  }
  if (!user.isAdmin) {
    return jsonError(c, 'Forbidden', 403);
  }
  await next();
};

export type BanStatus = {
  banned: boolean;
  bannedUntil: string | null;
  reason: string | null;
};

export async function getBanStatus(c: HonoContext, userId: string): Promise<BanStatus> {
  const row = await queryFirst<{ banned_until: string | null; banned_reason: string | null }>(
    c,
    `SELECT banned_until, banned_reason FROM users WHERE id = ?`,
    [userId]
  );
  if (!row || !row.banned_until) {
    return { banned: false, bannedUntil: null, reason: null };
  }
  const now = new Date().toISOString();
  const banned = row.banned_until > now;
  return { banned, bannedUntil: row.banned_until, reason: row.banned_reason };
}

export async function requireNotBanned(c: HonoContext): Promise<Response | undefined> {
  const user = c.get('user');
  if (!user) return undefined;
  const status = await getBanStatus(c, user.id);
  if (status.banned) {
    return jsonError(
      c,
      status.bannedUntil && status.bannedUntil.startsWith('9999')
        ? `Account permanently banned${status.reason ? `: ${status.reason}` : ''}`
        : `Account banned until ${new Date(status.bannedUntil!).toLocaleString()}${status.reason ? `: ${status.reason}` : ''}`,
      403
    );
  }
  return undefined;
}

export async function logAdminAction(
  c: HonoContext,
  action: string,
  targetUserId: string | null,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const admin = c.get('user');
  if (!admin) return;
  const now = new Date().toISOString();
  await runQuery(
    c,
    `INSERT INTO admin_actions (id, admin_id, target_user_id, action, reason, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), admin.id, targetUserId, action, reason, metadata ? JSON.stringify(metadata) : null, now]
  );
}

export async function getRecentAdminActionCount(c: HonoContext, days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const row = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM admin_actions WHERE created_at >= ?`,
    [since]
  );
  return Number(row?.count ?? 0);
}
