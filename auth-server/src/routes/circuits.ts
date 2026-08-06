import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { config } from '../config.js';
import { minioClient } from '../minio.js';
import { requireAuth } from '../hooks/requireAuth.js';
import { createCircuitSchema, updateCircuitSchema } from '../schemas/circuits.js';
import { parsePngDataUrl } from '../utils/dataUrl.js';
import { recordAnalyticsEvent } from '../utils/analytics.js';

type CircuitRow = {
  id: string;
  user_id: string;
  name: string;
  circuit: unknown;
  thumbnail_key: string | null;
  shared: boolean;
  created_at: string;
  updated_at: string;
};

function circuitResponse(row: CircuitRow, username: string) {
  return {
    id: row.id,
    name: row.name,
    username,
    circuit: row.circuit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: row.shared,
    thumbnailUrl: row.thumbnail_key ? `/auth/circuits/${row.id}/thumbnail` : null,
  };
}

async function uploadThumbnail(userId: string, circuitId: string, dataUrl: string): Promise<string> {
  const buf = parsePngDataUrl(dataUrl);
  const key = `${userId}/${circuitId}/${randomUUID()}.png`;
  await minioClient.putObject(config.minio.bucketThumbnails, key, buf, buf.length, {
    'Content-Type': 'image/png',
  });
  return key;
}

function removeObjectQuietly(bucket: string, key: string, log: { warn: (obj: object, msg: string) => void }) {
  minioClient.removeObject(bucket, key).catch((err) => {
    log.warn({ err }, 'Failed to remove MinIO object');
  });
}

function getClientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

async function findOwnedCircuit(id: string, userId: string): Promise<CircuitRow | null> {
  const {
    rows: [row],
  } = await pool.query('SELECT * FROM circuits WHERE id = $1 AND user_id = $2', [id, userId]);
  return row ?? null;
}

const circuitRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const { name, circuit, thumbnail } = createCircuitSchema.parse(req.body);
    const user = req.user!;

    const circuitId = randomUUID();
    let thumbnailKey: string | null = null;
    if (thumbnail) {
      try {
        thumbnailKey = await uploadThumbnail(user.id, circuitId, thumbnail);
      } catch (err: unknown) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : 'Invalid thumbnail' };
      }
    }

    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO circuits(id, user_id, name, circuit, thumbnail_key)
       VALUES($1, $2, $3, $4, $5) RETURNING *`,
      [circuitId, user.id, name, JSON.stringify(circuit), thumbnailKey]
    );

    await recordAnalyticsEvent({
      type: 'circuit_created',
      path: '/circuits',
      userId: user.id,
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
      metadata: { circuitId: row.id },
    });

    reply.code(201);
    return { circuit: circuitResponse(row, user.username) };
  });

  app.get('/', { preHandler: requireAuth }, async (req) => {
    const user = req.user!;
    const { rows } = await pool.query(
      'SELECT * FROM circuits WHERE user_id = $1 ORDER BY updated_at DESC',
      [user.id]
    );
    return { circuits: rows.map((r: CircuitRow) => circuitResponse(r, user.username)) };
  });

  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user!;
    const row = await findOwnedCircuit(id, user.id);
    if (!row) {
      reply.code(404);
      return { error: 'Circuit not found' };
    }
    return { circuit: circuitResponse(row, user.username) };
  });

  app.patch('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user!;
    const body = updateCircuitSchema.parse(req.body);

    const row = await findOwnedCircuit(id, user.id);
    if (!row) {
      reply.code(404);
      return { error: 'Circuit not found' };
    }

    let thumbnailKey = row.thumbnail_key;
    if (body.thumbnail) {
      try {
        thumbnailKey = await uploadThumbnail(user.id, id, body.thumbnail);
      } catch (err: unknown) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : 'Invalid thumbnail' };
      }
      if (row.thumbnail_key) {
        removeObjectQuietly(config.minio.bucketThumbnails, row.thumbnail_key, req.log);
      }
    }

    const {
      rows: [updated],
    } = await pool.query(
      `UPDATE circuits
       SET name = $1,
           circuit = $2,
           thumbnail_key = $3,
           shared = COALESCE($4, shared),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        body.name ?? row.name,
        body.circuit ? JSON.stringify(body.circuit) : row.circuit,
        thumbnailKey,
        body.shared ?? null,
        id,
      ]
    );

    if (body.shared === true && !row.shared) {
      await recordAnalyticsEvent({
        type: 'circuit_shared',
        path: `/circuits/${id}`,
        userId: user.id,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || ''),
        metadata: { circuitId: id },
      });
    }

    return { circuit: circuitResponse(updated, user.username) };
  });

  app.delete('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user!;
    const row = await findOwnedCircuit(id, user.id);
    if (!row) {
      reply.code(404);
      return { error: 'Circuit not found' };
    }

    await pool.query('DELETE FROM circuits WHERE id = $1', [id]);
    if (row.thumbnail_key) {
      removeObjectQuietly(config.minio.bucketThumbnails, row.thumbnail_key, req.log);
    }
    return { success: true };
  });

  app.get('/:id/thumbnail', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user!;
    const row = await findOwnedCircuit(id, user.id);
    if (!row || !row.thumbnail_key) {
      reply.code(404);
      return { error: 'Thumbnail not found' };
    }

    const stream = await minioClient.getObject(config.minio.bucketThumbnails, row.thumbnail_key);
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(stream);
  });
};

export default circuitRoutes;
