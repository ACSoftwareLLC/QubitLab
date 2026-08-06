import { Hono } from 'hono';
import type { HonoEnv } from './types.js';
import { loadSessionMiddleware } from './session.js';
import { validateOrigin } from './origin.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import circuitRoutes from './routes/circuits.js';
import marketplaceRoutes from './routes/marketplace.js';
import blogRoutes from './routes/blogs.js';
import userRoutes from './routes/users.js';
import analyticsRoutes from './routes/analytics.js';

const app = new Hono<HonoEnv>();

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
auth.route('/analytics', analyticsRoutes);

app.route('/auth', auth);

export default app;
