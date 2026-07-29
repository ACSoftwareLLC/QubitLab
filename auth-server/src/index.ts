import fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { ZodError } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { ensureBuckets } from './minio.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import circuitRoutes from './routes/circuits.js';
import mediaRoutes from './routes/media.js';
import './types/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

export async function buildApp() {
  const app = fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 });

  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    const sessionId = req.cookies.sessionId;
    if (!sessionId) return;

    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.username, u.pfp_key
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
  await app.register(accountRoutes, { prefix: '/auth/account' });
  await app.register(circuitRoutes, { prefix: '/auth/circuits' });
  await app.register(mediaRoutes, { prefix: '/auth' });

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

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400);
      return { error: 'Validation error', issues: err.issues };
    }
    req.log.error(err);
    const e = err as { statusCode?: number; message?: string };
    reply.code(e.statusCode || 500);
    return { error: e.message || 'Internal server error' };
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const app = await buildApp();
  await migrate();
  await ensureBuckets();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Auth server listening on http://${config.host}:${config.port}`);
}
