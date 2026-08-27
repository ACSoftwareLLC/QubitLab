import { Hono } from 'hono';
import type { HonoEnv, WorkerBindings } from './types.js';
import { loadSessionMiddleware, deleteExpiredSessions } from './session.js';
import { validateOrigin } from './origin.js';
import { logRequestError } from './logger.js';
import { jsonError } from './errors.js';
import { purgeOldRateLimits } from './rate-limit.js';
import { applySecurityHeaders } from './security-headers.js';
import { jsonBodyMiddleware } from './json-body.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import circuitRoutes from './routes/circuits.js';
import marketplaceRoutes from './routes/marketplace.js';
import blogRoutes from './routes/blogs.js';
import templateRoutes from './routes/templates.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import statsRoutes from './routes/stats.js';

const app = new Hono<HonoEnv>();

app.onError((err, c) => {
  if (err instanceof SyntaxError || (err instanceof Error && err.name === 'SyntaxError')) {
    return jsonError(c, 'Invalid JSON', 400);
  }
  const requestId = c.req.header('CF-Ray') ?? crypto.randomUUID();
  logRequestError(c, err, requestId);
  return jsonError(c, 'Internal server error', 500);
});

const auth = new Hono<HonoEnv>();

// Attach the current user to every /auth/* request and validate origin on state-changing requests.
auth.use(loadSessionMiddleware);
auth.use(validateOrigin);
auth.use(jsonBodyMiddleware);

auth.route('/', authRoutes);
auth.route('/account', accountRoutes);
auth.route('/circuits', circuitRoutes);
auth.route('/marketplace', marketplaceRoutes);
auth.route('/blogs', blogRoutes);
auth.route('/templates', templateRoutes);
auth.route('/users', userRoutes);
auth.route('/admin', adminRoutes);
auth.route('/analytics', analyticsRoutes);
auth.route('/stats', statsRoutes);

app.route('/auth', auth);

export default {
  async fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // API routes: run through Hono and harden the response.
    if (url.pathname.startsWith('/auth/')) {
      const response = await app.fetch(request, env, ctx);
      return applySecurityHeaders(response);
    }

    // Static assets: serve through the ASSETS binding and apply the same
    // security headers. When ASSETS is unavailable (e.g., some unit tests),
    // fall back to a minimal 404 so tests don't need a full asset binding.
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      return applySecurityHeaders(assetResponse);
    }

    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller: unknown, env: WorkerBindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([
        deleteExpiredSessions(env.DB).catch((err) => {
          console.error('Failed to delete expired sessions', err);
        }),
        purgeOldRateLimits(env.DB).catch((err) => {
          console.error('Failed to purge old rate limits', err);
        })
      ])
    );
  },
};
