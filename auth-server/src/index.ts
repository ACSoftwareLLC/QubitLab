import fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticPlugin from '@fastify/static';
import { ZodError } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import authRoutes from './routes/auth.js';
import './types/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

const app = fastify({ logger: true });

await app.register(cookie, {
  secret: config.sessionSecret,
});

app.decorateRequest('user', null);

app.addHook('onRequest', async (req) => {
  req.user = null;
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.expires_at > NOW()`,
      [sessionId]
    );
    if (rows.length > 0) {
      req.user = rows[0];
    }
  } catch (err) {
    req.log.error(err);
  }
});

await app.register(authRoutes, { prefix: '/auth' });

await app.register(staticPlugin, {
  root: publicDir,
  prefix: '/',
  wildcard: false,
});

app.get('/', async (req, reply) => {
  return reply.redirect('/auth');
});

app.get('/auth', async (req, reply) => {
  return reply.sendFile('auth.html');
});

app.setErrorHandler((err: any, req, reply) => {
  if (err instanceof ZodError) {
    reply.code(400);
    return { error: 'Validation error', issues: err.issues };
  }
  req.log.error(err);
  reply.code(err.statusCode || 500);
  return { error: err.message || 'Internal server error' };
});

await migrate();

await app.listen({ port: config.port, host: config.host });

console.log(`Auth server listening on http://${config.host}:${config.port}`);
