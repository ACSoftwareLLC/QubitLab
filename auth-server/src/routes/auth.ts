import { randomUUID } from 'crypto';
import { FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';
import { publicUser } from '../utils/user.js';
import { recordAnalyticsEvent } from '../utils/analytics.js';
import { verifyTurnstileToken } from '../utils/turnstile.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setSessionCookie(reply: FastifyReply, sessionId: string, expires: Date) {
  reply.setCookie('sessionId', sessionId, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    expires,
  });
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie('sessionId', { path: '/' });
}

function getClientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/turnstile-sitekey', async () => ({
    siteKey: config.turnstile.siteKey || null,
  }));

  app.post('/register', async (req, reply) => {
    const { username, password, turnstileToken } = registerSchema.parse(req.body);

    if (config.turnstile.secretKey) {
      if (!turnstileToken) {
        reply.code(400);
        return { error: 'Turnstile verification required' };
      }
      const valid = await verifyTurnstileToken(turnstileToken);
      if (!valid) {
        reply.code(400);
        return { error: 'Turnstile verification failed' };
      }
    }

    const hash = await bcrypt.hash(password, 10);

    try {
      const {
        rows: [user],
      } = await pool.query(
        'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id, username, pfp_key, first_name, last_name, bio, created_at',
        [username, hash]
      );

      const sessionId = randomUUID();
      const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
      await pool.query(
        'INSERT INTO sessions(id, user_id, expires_at) VALUES($1, $2, $3)',
        [sessionId, user.id, expires]
      );
      setSessionCookie(reply, sessionId, expires);

      await recordAnalyticsEvent({
        type: 'user_registered',
        path: '/register',
        userId: user.id,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || ''),
        referrer: String(req.headers['referer'] || ''),
        language: String(req.headers['accept-language'] || '').split(',')[0],
      });

      return { user: publicUser(user) };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
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
      'SELECT id, username, password_hash, pfp_key, first_name, last_name, bio FROM users WHERE username = $1',
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

    return { user: publicUser(user) };
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
    return { user: publicUser(req.user) };
  });
};

export default authRoutes;
