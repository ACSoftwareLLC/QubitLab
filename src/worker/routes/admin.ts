import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { queryFirst, queryAll, runQuery } from '../db.js';
import { requireAdmin, logAdminAction } from '../auth.js';
import { r2Delete } from '../r2.js';
import { z } from 'zod';

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  pfp_key: string | null;
  created_at: string;
  banned_until: string | null;
  banned_reason: string | null;
};

const admin = new Hono<HonoEnv>();

admin.use(requireAdmin);

const searchQuerySchema = z.object({
  search: z.string().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

admin.get('/users', async (c) => {
  const query = c.req.query();
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { search, limit } = parsed.data;
  const pattern = `%${search.replace(/[%_]/g, '\\$&')}%`;

  const rows = await queryAll<AdminUserRow>(
    c,
    `SELECT id, username, email, first_name, last_name, bio, pfp_key, created_at,
            banned_until, banned_reason
     FROM users
     WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
     ORDER BY username ASC
     LIMIT ?`,
    [pattern, pattern, limit]
  );

  return c.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      bio: r.bio,
      pfpUrl: r.pfp_key ? `/auth/users/${r.id}/avatar` : null,
      createdAt: r.created_at,
      bannedUntil: r.banned_until,
      bannedReason: r.banned_reason,
      isBanned: r.banned_until ? r.banned_until > new Date().toISOString() : false,
    })),
  });
});

admin.get('/users/:id/actions', async (c) => {
  const id = c.req.param('id');
  const rows = await queryAll<{
    id: string;
    admin_id: string;
    admin_username: string;
    action: string;
    reason: string;
    metadata: string | null;
    created_at: string;
  }>(
    c,
    `SELECT aa.id, aa.admin_id, u.username as admin_username, aa.action, aa.reason, aa.metadata, aa.created_at
     FROM admin_actions aa
     LEFT JOIN users u ON aa.admin_id = u.id
     WHERE aa.target_user_id = ?
     ORDER BY aa.created_at DESC
     LIMIT 100`,
    [id]
  );

  return c.json({
    actions: rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      adminUsername: r.admin_username,
      action: r.action,
      reason: r.reason,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
      createdAt: r.created_at,
    })),
  });
});

const deleteUserSchema = z.object({
  reason: z.string().min(1).max(2000),
});

admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = deleteUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { reason } = parsed.data;
  const adminUser = c.get('user')!;

  if (id === adminUser.id) {
    return jsonError(c, 'You cannot delete your own account', 400);
  }

  const target = await queryFirst<{ username: string; email: string | null; pfp_key: string | null }>(
    c,
    `SELECT username, email, pfp_key FROM users WHERE id = ?`,
    [id]
  );
  if (!target) {
    return jsonError(c, 'User not found', 404);
  }

  // Collect thumbnail keys so they can be removed from R2 after DB deletion.
  const circuitRows = await queryAll<{ thumbnail_key: string | null }>(
    c,
    `SELECT thumbnail_key FROM circuits WHERE user_id = ?`,
    [id]
  );
  const thumbnailKeys = circuitRows
    .map((r) => r.thumbnail_key)
    .filter((k): k is string => Boolean(k));

  await logAdminAction(c, 'delete_user', id, reason, {
    username: target.username,
    email: target.email,
  });

  await runQuery(c, `DELETE FROM users WHERE id = ?`, [id]);

  if (target.pfp_key) {
    c.executionCtx.waitUntil(r2Delete(c, 'AVATARS', target.pfp_key).catch(() => {}));
  }
  for (const key of thumbnailKeys) {
    c.executionCtx.waitUntil(r2Delete(c, 'THUMBNAILS', key).catch(() => {}));
  }

  return c.json({ success: true });
});

const banUserSchema = z.object({
  reason: z.string().min(1).max(2000),
  durationDays: z.union([z.literal(7), z.literal(30), z.literal(365), z.literal(0)]),
  blacklistEmail: z.boolean().default(false),
});

function computeBanUntil(durationDays: number): string {
  if (durationDays === 0) {
    // Permanent marker: far-future date so it sorts cleanly and survives normal queries.
    return '9999-12-31T23:59:59.999Z';
  }
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

admin.post('/users/:id/ban', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = banUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { reason, durationDays, blacklistEmail } = parsed.data;
  const adminUser = c.get('user')!;

  if (id === adminUser.id) {
    return jsonError(c, 'You cannot ban yourself', 400);
  }

  const target = await queryFirst<{ username: string; email: string | null }>(
    c,
    `SELECT username, email FROM users WHERE id = ?`,
    [id]
  );
  if (!target) {
    return jsonError(c, 'User not found', 404);
  }

  const bannedUntil = computeBanUntil(durationDays);
  const permanent = durationDays === 0;
  const shouldBlacklist = blacklistEmail || reason.toLowerCase().includes('abuse');

  await runQuery(
    c,
    `UPDATE users SET banned_until = ?, banned_reason = ? WHERE id = ?`,
    [bannedUntil, reason, id]
  );

  // Invalidate all active sessions so the ban takes effect immediately.
  await runQuery(c, `DELETE FROM sessions WHERE user_id = ?`, [id]);

  const metadata: Record<string, unknown> = {
    username: target.username,
    email: target.email,
    durationDays: permanent ? 'permanent' : durationDays,
    bannedUntil,
  };

  await logAdminAction(c, 'ban_user', id, reason, metadata);

  if (shouldBlacklist && target.email) {
    await runQuery(
      c,
      `INSERT INTO email_blacklist (email, reason, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
      [target.email, `Banned for abuse: ${reason}`, new Date().toISOString()]
    );
    await logAdminAction(c, 'blacklist_email', id, `Blacklisted email after ban: ${reason}`, {
      email: target.email,
    });
  }

  return c.json({
    success: true,
    bannedUntil,
    permanent,
    blacklistedEmail: shouldBlacklist && Boolean(target.email),
  });
});

const unbanUserSchema = z.object({
  reason: z.string().min(1).max(2000),
  removeBlacklist: z.boolean().default(false),
});

admin.post('/users/:id/unban', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = unbanUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { reason, removeBlacklist } = parsed.data;

  const target = await queryFirst<{ username: string; email: string | null; banned_until: string | null }>(
    c,
    `SELECT username, email, banned_until FROM users WHERE id = ?`,
    [id]
  );
  if (!target) {
    return jsonError(c, 'User not found', 404);
  }

  await runQuery(
    c,
    `UPDATE users SET banned_until = NULL, banned_reason = NULL WHERE id = ?`,
    [id]
  );

  const metadata: Record<string, unknown> = {
    username: target.username,
    email: target.email,
    wasBannedUntil: target.banned_until,
  };

  await logAdminAction(c, 'unban_user', id, reason, metadata);

  if (removeBlacklist && target.email) {
    await runQuery(c, `DELETE FROM email_blacklist WHERE email = ?`, [target.email]);
    await logAdminAction(c, 'remove_blacklist_email', id, `Removed email from blacklist: ${reason}`, {
      email: target.email,
    });
  }

  return c.json({ success: true, removedBlacklist: removeBlacklist && Boolean(target.email) });
});

admin.get('/blacklist', async (c) => {
  const rows = await queryAll<{ email: string; reason: string; created_at: string }>(
    c,
    `SELECT email, reason, created_at FROM email_blacklist ORDER BY created_at DESC LIMIT 200`
  );
  return c.json({
    emails: rows.map((r) => ({ email: r.email, reason: r.reason, createdAt: r.created_at })),
  });
});

const blacklistEmailSchema = z.object({
  email: z.string().email(),
  reason: z.string().min(1).max(2000),
});

admin.post('/blacklist', async (c) => {
  const body = await c.req.json();
  const parsed = blacklistEmailSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { email, reason } = parsed.data;
  await runQuery(
    c,
    `INSERT INTO email_blacklist (email, reason, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
    [email, reason, new Date().toISOString()]
  );
  await logAdminAction(c, 'blacklist_email', null, reason, { email });
  return c.json({ success: true });
});

const removeBlacklistSchema = z.object({
  email: z.string().email(),
  reason: z.string().min(1).max(2000),
});

admin.delete('/blacklist', async (c) => {
  const body = await c.req.json();
  const parsed = removeBlacklistSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }

  const { email, reason } = parsed.data;
  await runQuery(c, `DELETE FROM email_blacklist WHERE email = ?`, [email]);
  await logAdminAction(c, 'remove_blacklist_email', null, reason, { email });
  return c.json({ success: true });
});

export default admin;
