import { Hono } from 'hono';
import type { HonoEnv } from './types.js';
import { loadSessionMiddleware } from './session.js';
import { jsonError } from './errors.js';
import { publicUser } from './types.js';

const app = new Hono<HonoEnv>();

const auth = new Hono<HonoEnv>();

auth.use(loadSessionMiddleware);

auth.get('/health', (c) => c.json({ status: 'ok' }));

auth.get('/turnstile-sitekey', (c) => {
  const siteKey = c.env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    return jsonError(c, 'Turnstile site key not configured', 500);
  }
  return c.json({ siteKey });
});

auth.get('/me', (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'Unauthorized', 401);
  }
  return c.json({ user: publicUser(user, c.env.ADMINS) });
});

app.route('/auth', auth);

export default app;
