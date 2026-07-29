import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { config } from '../config.js';
import { minioClient } from '../minio.js';
import { requireAuth } from '../hooks/requireAuth.js';

const mediaRoutes: FastifyPluginAsync = async (app) => {
  // Avatars are visible to any logged-in user — circuit cards display other
  // users' identities and future sharing will need it.
  app.get('/users/:id/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const {
      rows: [row],
    } = await pool.query('SELECT pfp_key FROM users WHERE id = $1', [id]);

    if (!row || !row.pfp_key) {
      reply.code(404);
      return { error: 'Avatar not found' };
    }

    try {
      const stream = await minioClient.getObject(config.minio.bucketAvatars, row.pfp_key);
      reply.header('Content-Type', contentTypeForKey(row.pfp_key));
      reply.header('Cache-Control', 'no-cache');
      return reply.send(stream);
    } catch {
      reply.code(404);
      return { error: 'Avatar not found' };
    }
  });
};

function contentTypeForKey(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export default mediaRoutes;
