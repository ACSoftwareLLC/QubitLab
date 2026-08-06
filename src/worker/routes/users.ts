import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { publicUser } from '../types.js';
import { jsonError } from '../errors.js';
import { queryFirst } from '../db.js';
import { r2Get } from '../r2.js';

export type UserRow = {
  id: string;
  username: string;
  pfp_key: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  created_at: string;
};

const users = new Hono<HonoEnv>();

users.get('/:username', async (c) => {
  const username = c.req.param('username');
  const row = await queryFirst<UserRow>(
    c,
    `SELECT id, username, pfp_key, first_name, last_name, bio, created_at
     FROM users WHERE username = ?`,
    [username]
  );

  if (!row) {
    return jsonError(c, 'User not found', 404);
  }

  return c.json({ user: publicUser(row, c.env.ADMINS) });
});

users.get('/:id/avatar', async (c) => {
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

export default users;
