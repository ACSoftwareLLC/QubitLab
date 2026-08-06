import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { jsonError } from '../errors.js';
import { queryFirst } from '../db.js';
import { r2Get } from '../r2.js';

const media = new Hono<HonoEnv>();

media.get('/users/:id/avatar', async (c) => {
  const id = c.req.param('id');
  const row = await queryFirst<{ pfp_key: string | null }>(
    c,
    `SELECT pfp_key FROM users WHERE id = ?`,
    [id]
  );

  if (!row || !row.pfp_key) {
    return jsonError(c, 'Avatar not found', 404);
  }

  const response = await r2Get(c, 'AVATARS', row.pfp_key);
  if (!response) {
    return jsonError(c, 'Avatar not found', 404);
  }

  return response;
});

export default media;
