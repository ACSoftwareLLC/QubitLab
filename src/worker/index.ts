import { Hono } from 'hono';
import type { HonoEnv, WorkerBindings } from './types.js';
import { loadSessionMiddleware, deleteExpiredSessions } from './session.js';
import { validateOrigin } from './origin.js';
import { logRequestError } from './logger.js';
import { jsonError } from './errors.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import circuitRoutes from './routes/circuits.js';
import marketplaceRoutes from './routes/marketplace.js';
import blogRoutes from './routes/blogs.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import statsRoutes from './routes/stats.js';

const app = new Hono<HonoEnv>();

app.onError((err, c) => {
  const requestId = c.req.header('CF-Ray') ?? crypto.randomUUID();
  logRequestError(c, err, requestId);
  return jsonError(c, 'Internal server error', 500);
});

const auth = new Hono<HonoEnv>();

// Attach the current user to every /auth/* request and validate origin on state-changing requests.
auth.use(loadSessionMiddleware);
auth.use(validateOrigin);

auth.route('/', authRoutes);
auth.route('/account', accountRoutes);
auth.route('/circuits', circuitRoutes);
auth.route('/marketplace', marketplaceRoutes);
auth.route('/blogs', blogRoutes);
auth.route('/users', userRoutes);
auth.route('/admin', adminRoutes);
auth.route('/analytics', analyticsRoutes);
auth.route('/stats', statsRoutes);

app.route('/auth', auth);

export default {
  async fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_controller: unknown, env: WorkerBindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      deleteExpiredSessions(env.DB).catch((err) => {
        console.error('Failed to delete expired sessions', err);
      })
    );
  },
};
