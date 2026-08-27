import { Hono } from 'hono';
import type { HonoEnv, HonoContext } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { createCircuitSchema, updateCircuitSchema } from '../schemas.js';
import { queryFirst, queryAll, runQuery } from '../db.js';
import { requireAuth, requireNotBanned } from '../auth.js';
import { rateLimitUser, checkUserActionLimit, recordUserAction } from '../rate-limit.js';
import { r2Upload, r2Delete, r2Get } from '../r2.js';
import { parsePngDataUrl } from '../buffer.js';
import { randomUUID } from '../crypto.js';
import { recordAnalyticsEvent } from '../analytics.js';

const circuits = new Hono<HonoEnv>();

const MAX_CIRCUITS_PER_USER = 100;

export type CircuitRow = {
  id: string;
  user_id: string;
  name: string;
  circuit: string;
  thumbnail_key: string | null;
  shared: number;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
};

function circuitResponse(row: CircuitRow, username: string) {
  return {
    id: row.id,
    name: row.name,
    username,
    circuit: JSON.parse(row.circuit) as unknown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: row.shared === 1,
    thumbnailUrl: row.thumbnail_key ? `/auth/circuits/${row.id}/thumbnail` : null,
  };
}

async function uploadThumbnail(
  c: HonoContext,
  userId: string,
  circuitId: string,
  dataUrl: string
): Promise<string> {
  const bytes = parsePngDataUrl(dataUrl);
  const key = `${userId}/${circuitId}/${randomUUID()}.png`;
  await r2Upload(c, 'THUMBNAILS', key, bytes, 'image/png');
  return key;
}

async function findOwnedCircuit(
  c: HonoContext,
  id: string,
  userId: string
): Promise<CircuitRow | null> {
  return queryFirst<CircuitRow>(
    c,
    `SELECT id, user_id, name, circuit, thumbnail_key, shared, shared_at, created_at, updated_at
     FROM circuits WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
}

circuits.use(requireAuth);

circuits.post('/', rateLimitUser('circuit_create', 10, 60 * 1000), async (c) => {
  const body = await c.req.json();
  const result = createCircuitSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const { name, circuit, thumbnail } = result.data;
  const user = c.get('user')!;

  const countRow = await queryFirst<{ count: number }>(
    c,
    `SELECT COUNT(*) as count FROM circuits WHERE user_id = ?`,
    [user.id]
  );
  if ((countRow?.count ?? 0) >= MAX_CIRCUITS_PER_USER) {
    return jsonError(
      c,
      `Circuit quota exceeded: you may store up to ${MAX_CIRCUITS_PER_USER} circuits`,
      403
    );
  }

  const circuitId = randomUUID();
  const now = new Date().toISOString();

  let thumbnailKey: string | null = null;
  if (thumbnail) {
    try {
      thumbnailKey = await uploadThumbnail(c, user.id, circuitId, thumbnail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid thumbnail';
      return jsonError(c, message, 400);
    }
  }

  await runQuery(
    c,
    `INSERT INTO circuits (id, user_id, name, circuit, thumbnail_key, shared, shared_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [circuitId, user.id, name, JSON.stringify(circuit), thumbnailKey, now, now]
  );

  c.executionCtx.waitUntil(
    recordAnalyticsEvent(c, {
      type: 'circuit_created',
      path: '/circuits',
      userId: user.id,
      metadata: { circuitId },
    }).catch(() => {})
  );

  const row = await queryFirst<CircuitRow>(
    c,
    `SELECT id, user_id, name, circuit, thumbnail_key, shared, shared_at, created_at, updated_at
     FROM circuits WHERE id = ?`,
    [circuitId]
  );

  return c.json({ circuit: circuitResponse(row!, user.username) }, 201);
});

circuits.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await queryAll<CircuitRow>(
    c,
    `SELECT id, user_id, name, circuit, thumbnail_key, shared, shared_at, created_at, updated_at
     FROM circuits WHERE user_id = ? ORDER BY updated_at DESC`,
    [user.id]
  );
  return c.json({ circuits: rows.map((r) => circuitResponse(r, user.username)) });
});

circuits.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const row = await findOwnedCircuit(c, id, user.id);
  if (!row) {
    return jsonError(c, 'Circuit not found', 404);
  }
  return c.json({ circuit: circuitResponse(row, user.username) });
});

circuits.patch('/:id', rateLimitUser('circuit_save', 20, 60 * 1000), async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = updateCircuitSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const row = await findOwnedCircuit(c, id, user.id);
  if (!row) {
    return jsonError(c, 'Circuit not found', 404);
  }

  if (result.data.shared === true && row.shared === 0) {
    const banned = await requireNotBanned(c);
    if (banned) return banned;

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const overLimit = await checkUserActionLimit(c, 'circuit_share', 20, WEEK_MS);
    if (overLimit) {
      return jsonError(c, 'Weekly share limit reached (20)', 429);
    }
  }

  let thumbnailKey = row.thumbnail_key;
  if (result.data.thumbnail) {
    try {
      thumbnailKey = await uploadThumbnail(c, user.id, id, result.data.thumbnail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid thumbnail';
      return jsonError(c, message, 400);
    }
    if (row.thumbnail_key) {
      c.executionCtx.waitUntil(r2Delete(c, 'THUMBNAILS', row.thumbnail_key).catch(() => {}));
    }
  }

  const name = result.data.name ?? row.name;
  const circuit = result.data.circuit ? JSON.stringify(result.data.circuit) : row.circuit;
  const shared = result.data.shared !== undefined ? (result.data.shared ? 1 : 0) : row.shared;
  const sharedAt = result.data.shared === true && row.shared === 0 ? new Date().toISOString() : row.shared_at;
  const now = new Date().toISOString();

  const updated = await queryFirst<CircuitRow>(
    c,
    `UPDATE circuits
     SET name = ?, circuit = ?, thumbnail_key = ?, shared = ?, shared_at = ?, updated_at = ?
     WHERE id = ?
     RETURNING id, user_id, name, circuit, thumbnail_key, shared, created_at, updated_at`,
    [name, circuit, thumbnailKey, shared, sharedAt, now, id]
  );

  if (result.data.shared === true && row.shared === 0) {
    c.executionCtx.waitUntil(
      recordAnalyticsEvent(c, {
        type: 'circuit_shared',
        path: `/circuits/${id}`,
        userId: user.id,
        metadata: { circuitId: id },
      }).catch(() => {})
    );
    c.executionCtx.waitUntil(recordUserAction(c, 'circuit_share').catch(() => {}));
  }

  return c.json({ circuit: circuitResponse(updated!, user.username) });
});

circuits.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const row = await findOwnedCircuit(c, id, user.id);
  if (!row) {
    return jsonError(c, 'Circuit not found', 404);
  }

  await runQuery(c, `DELETE FROM circuits WHERE id = ?`, [id]);

  if (row.thumbnail_key) {
    c.executionCtx.waitUntil(r2Delete(c, 'THUMBNAILS', row.thumbnail_key).catch(() => {}));
  }

  return c.json({ success: true });
});

circuits.get('/:id/thumbnail', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const row = await findOwnedCircuit(c, id, user.id);
  if (!row || !row.thumbnail_key) {
    return jsonError(c, 'Thumbnail not found', 404);
  }

  const response = await r2Get(c, 'THUMBNAILS', row.thumbnail_key);
  if (!response) {
    return jsonError(c, 'Thumbnail not found', 404);
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, { headers, status: response.status });
});

export default circuits;
