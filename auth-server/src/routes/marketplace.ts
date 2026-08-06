import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { config } from '../config.js';
import { minioClient } from '../minio.js';

import { pfpUrlFor } from '../utils/user.js';

export type MarketplaceCircuitRow = {
  id: string;
  user_id: string;
  username: string;
  name: string;
  circuit: unknown;
  thumbnail_key: string | null;
  shared: boolean;
  created_at: string;
  updated_at: string;
  user_pfp_key: string | null;
};

function marketplaceResponse(row: MarketplaceCircuitRow) {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    username: row.username,
    pfpUrl: pfpUrlFor(row.user_id, row.user_pfp_key),
    isAdmin: config.admins.includes(row.username),
    circuit: row.circuit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: row.shared,
    thumbnailUrl: row.thumbnail_key ? `/auth/marketplace/${row.id}/thumbnail` : null,
  };
}

const marketplaceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/marketplace', async () => {
    const { rows } = await pool.query(
      `SELECT c.id, c.user_id, u.username, u.pfp_key AS user_pfp_key, c.name, c.circuit, c.thumbnail_key, c.shared, c.created_at, c.updated_at
       FROM circuits c
       JOIN users u ON c.user_id = u.id
       WHERE c.shared = TRUE
       ORDER BY c.updated_at DESC
       LIMIT 200`,
      []
    );
    return { circuits: rows.map((r: MarketplaceCircuitRow) => marketplaceResponse(r)) };
  });

  app.get('/marketplace/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `SELECT c.id, c.user_id, u.username, u.pfp_key AS user_pfp_key, c.name, c.circuit, c.thumbnail_key, c.shared, c.created_at, c.updated_at
       FROM circuits c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1 AND c.shared = TRUE`,
      [id]
    );
    if (rows.length === 0) {
      reply.code(404);
      return { error: 'Circuit not found' };
    }
    return { circuit: marketplaceResponse(rows[0] as MarketplaceCircuitRow) };
  });

  app.get('/marketplace/:id/thumbnail', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `SELECT thumbnail_key FROM circuits WHERE id = $1 AND shared = TRUE`,
      [id]
    );
    if (rows.length === 0 || !rows[0].thumbnail_key) {
      reply.code(404);
      return { error: 'Thumbnail not found' };
    }

    const stream = await minioClient.getObject(
      config.minio.bucketThumbnails,
      rows[0].thumbnail_key as string
    );
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(stream);
  });
};

export default marketplaceRoutes;
