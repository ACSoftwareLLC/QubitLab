import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { minioClient } from '../minio.js';
import { requireAuth } from '../hooks/requireAuth.js';
import { updateUsernameSchema, updatePasswordSchema } from '../schemas/account.js';
import { publicUser } from '../utils/user.js';

const AVATAR_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const accountRoutes: FastifyPluginAsync = async (app) => {
  app.patch('/username', { preHandler: requireAuth }, async (req, reply) => {
    const { username } = updateUsernameSchema.parse(req.body);
    const user = req.user!;

    try {
      const {
        rows: [updated],
      } = await pool.query(
        'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, pfp_key',
        [username, user.id]
      );
      return { user: publicUser(updated) };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        reply.code(409);
        return { error: 'Username already taken' };
      }
      throw err;
    }
  });

  app.patch('/password', { preHandler: requireAuth }, async (req, reply) => {
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
    const user = req.user!;

    const {
      rows: [row],
    } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);

    if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
      reply.code(403);
      return { error: 'Current password is incorrect' };
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

    // Invalidate every other session for this user, keeping the current one.
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [
      user.id,
      req.cookies.sessionId,
    ]);

    return { success: true };
  });

  app.post('/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user!;
    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: 'No file uploaded' };
    }

    const ext = AVATAR_MIME_TYPES[file.mimetype];
    if (!ext) {
      reply.code(400);
      return { error: 'Avatar must be a PNG, JPEG, or WebP image' };
    }

    const buf = await file.toBuffer();
    if (file.file.truncated) {
      reply.code(413);
      return { error: 'Avatar exceeds the 5MB size limit' };
    }

    const key = `${user.id}/${randomUUID()}.${ext}`;
    await minioClient.putObject(config.minio.bucketAvatars, key, buf, buf.length, {
      'Content-Type': file.mimetype,
    });

    const {
      rows: [updated],
    } = await pool.query(
      'UPDATE users SET pfp_key = $1 WHERE id = $2 RETURNING id, username, pfp_key',
      [key, user.id]
    );

    if (user.pfp_key) {
      minioClient.removeObject(config.minio.bucketAvatars, user.pfp_key).catch((err) => {
        req.log.warn({ err }, 'Failed to remove old avatar object');
      });
    }

    return { user: publicUser(updated) };
  });
};

export default accountRoutes;
