import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { publicUser } from '../types.js';
import {
  updateUsernameSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from '../schemas.js';
import { queryFirst, runQuery, uniqueConstraintError } from '../db.js';
import { verifyPassword, hashPassword } from '../password.js';
import { requireAuth } from '../auth.js';
import { checkUserActionLimit, recordUserAction, rateLimitUser } from '../rate-limit.js';
import { r2Upload, r2Delete } from '../r2.js';
import { sniffImageType } from '../buffer.js';
import { randomUUID } from '../crypto.js';
import { getSessionId, hashSessionId } from '../session.js';

const account = new Hono<HonoEnv>();

const AVATAR_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

account.use(requireAuth);

account.patch('/username', async (c) => {
  const body = await c.req.json();
  const result = updateUsernameSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const user = c.get('user')!;
  const { username } = result.data;

  const HOUR_MS = 60 * 60 * 1000;
  const overLimit = await checkUserActionLimit(c, 'username_change', 3, HOUR_MS);
  if (overLimit) {
    return jsonError(c, 'Username change limit reached (3 per hour)', 429);
  }

  try {
    const updated = await queryFirst<
      {
        id: string;
        username: string;
        pfp_key: string | null;
        first_name: string | null;
        last_name: string | null;
        bio: string | null;
        created_at: string;
        is_admin: number;
      }
    >(
      c,
      `UPDATE users SET username = ? WHERE id = ?
       RETURNING id, username, pfp_key, first_name, last_name, bio, created_at, is_admin`,
      [username, user.id]
    );
    await recordUserAction(c, 'username_change');
    return c.json({ user: publicUser(updated!, { self: true }) });
  } catch (err) {
    if (uniqueConstraintError(err)) {
      return jsonError(c, 'Username already taken', 409);
    }
    throw err;
  }
});

account.patch('/password', rateLimitUser('password_change', 10, 15 * 60 * 1000), async (c) => {
  const body = await c.req.json();
  const result = updatePasswordSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const user = c.get('user')!;
  const { currentPassword, newPassword } = result.data;

  const row = await queryFirst<{ password_hash: string }>(
    c,
    `SELECT password_hash FROM users WHERE id = ?`,
    [user.id]
  );

  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return jsonError(c, 'Current password is incorrect', 403);
  }

  const hash = await hashPassword(newPassword);
  await runQuery(c, `UPDATE users SET password_hash = ? WHERE id = ?`, [hash, user.id]);

  const currentSessionId = getSessionId(c);
  const currentSessionHash = currentSessionId ? await hashSessionId(currentSessionId) : null;
  await runQuery(
    c,
    `DELETE FROM sessions WHERE user_id = ? AND id <> ?`,
    [user.id, currentSessionHash ?? '']
  );

  return c.json({ success: true });
});

account.patch('/profile', async (c) => {
  const body = await c.req.json();
  const result = updateProfileSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const user = c.get('user')!;
  const { firstName, lastName, bio } = result.data;

  const updated = await queryFirst<
    {
      id: string;
      username: string;
      pfp_key: string | null;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
      created_at: string;
      is_admin: number;
    }
  >(
    c,
    `UPDATE users
     SET first_name = ?, last_name = ?, bio = ?
     WHERE id = ?
     RETURNING id, username, pfp_key, first_name, last_name, bio, created_at, is_admin`,
    [firstName ?? null, lastName ?? null, bio ?? null, user.id]
  );

  return c.json({ user: publicUser(updated!, { self: true }) });
});

account.post('/avatar', async (c) => {
  const user = c.get('user')!;

  const HOUR_MS = 60 * 60 * 1000;
  const overLimit = await checkUserActionLimit(c, 'avatar_change', 5, HOUR_MS);
  if (overLimit) {
    return jsonError(c, 'Avatar change limit reached (5 per hour)', 429);
  }

  const body = await c.req.parseBody({ all: false });
  const file = body.file;

  if (!(file instanceof File)) {
    return jsonError(c, 'No file uploaded', 400);
  }

  const ext = AVATAR_MIME_TYPES[file.type];
  if (!ext) {
    return jsonError(c, 'Avatar must be a PNG, JPEG, or WebP image', 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    return jsonError(c, 'Avatar exceeds the 5MB size limit', 413);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== ext) {
    return jsonError(c, 'Avatar file content does not match its extension', 400);
  }

  const key = `${user.id}/${randomUUID()}.${ext}`;
  await r2Upload(c, 'AVATARS', key, arrayBuffer, file.type);

  const updated = await queryFirst<
    {
      id: string;
      username: string;
      pfp_key: string | null;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
      created_at: string;
      is_admin: number;
    }
  >(
    c,
    `UPDATE users SET pfp_key = ? WHERE id = ?
     RETURNING id, username, pfp_key, first_name, last_name, bio, created_at, is_admin`,
    [key, user.id]
  );

  if (user.pfp_key) {
    c.executionCtx.waitUntil(r2Delete(c, 'AVATARS', user.pfp_key).catch(() => {}));
  }

  await recordUserAction(c, 'avatar_change');
  return c.json({ user: publicUser(updated!, { self: true }) });
});

export default account;
