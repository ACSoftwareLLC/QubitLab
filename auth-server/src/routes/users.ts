import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { publicUser } from '../utils/user.js';

const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users/:username', async (req, reply) => {
    const { username } = req.params as { username: string };
    const {
      rows: [row],
    } = await pool.query(
      'SELECT id, username, pfp_key, first_name, last_name, bio, created_at FROM users WHERE username = $1',
      [username]
    );

    if (!row) {
      reply.code(404);
      return { error: 'User not found' };
    }

    return { user: publicUser(row) };
  });
};

export default userRoutes;
