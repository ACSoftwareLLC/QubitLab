import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setSessionCookie(reply: any, sessionId: string, expires: Date) {
  reply.setCookie('sessionId', sessionId, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    expires,
  });
}

function clearSessionCookie(reply: any) {
  reply.clearCookie('sessionId', { path: '/' });
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/register', async (req, reply) => {
    const { username, password } = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(password, 10);

    try {
      const {
        rows: [user],
      } = await pool.query(
        'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id, username, created_at',
        [username, hash]
      );

      const sessionId = randomUUID();
      const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
      await pool.query(
        'INSERT INTO sessions(id, user_id, expires_at) VALUES($1, $2, $3)',
        [sessionId, user.id, expires]
      );
      setSessionCookie(reply, sessionId, expires);

      return { user: { id: user.id, username: user.username } };
    } catch (err: any) {
      if (err.code === '23505') {
        reply.code(409);
        return { error: 'Username already taken' };
      }
      throw err;
    }
  });

  app.post('/login', async (req, reply) => {
    const { username, password } = loginSchema.parse(req.body);
    const {
      rows: [user],
    } = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      reply.code(401);
      return { error: 'Invalid credentials' };
    }

    const sessionId = randomUUID();
    const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
    await pool.query(
      'INSERT INTO sessions(id, user_id, expires_at) VALUES($1, $2, $3)',
      [sessionId, user.id, expires]
    );
    setSessionCookie(reply, sessionId, expires);

    return { user: { id: user.id, username: user.username } };
  });

  app.post('/logout', async (req, reply) => {
    const sessionId = req.cookies.sessionId;
    if (sessionId) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }
    clearSessionCookie(reply);
    return { success: true };
  });

  app.get('/me', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    return { user: req.user };
  });
};

export default authRoutes;
