import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { publicUser } from '../types.js';
import { jsonError } from '../errors.js';
import { queryFirst, queryAll } from '../db.js';
import { r2Get } from '../r2.js';

export type MarketplaceCircuitRow = {
  id: string;
  user_id: string;
  username: string;
  name: string;
  circuit: string;
  thumbnail_key: string | null;
  shared: number;
  created_at: string;
  updated_at: string;
  pfp_key: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  is_admin: number;
};

function marketplaceResponse(row: MarketplaceCircuitRow) {
  const user = publicUser({
    id: row.user_id,
    username: row.username,
    pfp_key: row.pfp_key,
    is_admin: row.is_admin,
    first_name: row.first_name,
    last_name: row.last_name,
    bio: row.bio,
  });

  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    username: row.username,
    pfpUrl: user.pfpUrl,
    isAdmin: user.isAdmin,
    circuit: JSON.parse(row.circuit) as unknown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shared: row.shared === 1,
    thumbnailUrl: row.thumbnail_key ? `/auth/marketplace/${row.id}/thumbnail` : null,
  };
}

const marketplace = new Hono<HonoEnv>();

marketplace.get('/', async (c) => {
  const rows = await queryAll<MarketplaceCircuitRow>(
    c,
    `SELECT c.id, c.user_id, u.username, u.pfp_key, u.first_name, u.last_name, u.bio, u.is_admin,
            c.name, c.circuit, c.thumbnail_key, c.shared, c.created_at, c.updated_at
     FROM circuits c
     JOIN users u ON c.user_id = u.id
     WHERE c.shared = 1
     ORDER BY c.updated_at DESC
     LIMIT 200`
  );
  return c.json({ circuits: rows.map((r) => marketplaceResponse(r)) });
});

marketplace.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await queryFirst<MarketplaceCircuitRow>(
    c,
    `SELECT c.id, c.user_id, u.username, u.pfp_key, u.first_name, u.last_name, u.bio, u.is_admin,
            c.name, c.circuit, c.thumbnail_key, c.shared, c.created_at, c.updated_at
     FROM circuits c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ? AND c.shared = 1`,
    [id]
  );
  if (!row) {
    return jsonError(c, 'Circuit not found', 404);
  }
  return c.json({ circuit: marketplaceResponse(row) });
});

marketplace.get('/:id/thumbnail', async (c) => {
  const id = c.req.param('id');
  const row = await queryFirst<{ thumbnail_key: string | null }>(
    c,
    `SELECT thumbnail_key FROM circuits WHERE id = ? AND shared = 1`,
    [id]
  );
  if (!row || !row.thumbnail_key) {
    return jsonError(c, 'Thumbnail not found', 404);
  }

  const response = await r2Get(c, 'THUMBNAILS', row.thumbnail_key);
  if (!response) {
    return jsonError(c, 'Thumbnail not found', 404);
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(response.body, { headers, status: response.status });
});

export default marketplace;
