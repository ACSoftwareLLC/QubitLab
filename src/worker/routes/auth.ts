import { Hono } from 'hono';
import type { HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { publicUser } from '../types.js';
import { registerSchema, loginSchema } from '../schemas.js';
import { verifyTurnstileToken, shouldRequireTurnstile } from '../turnstile.js';
import { hashPassword, verifyPassword } from '../password.js';
import { randomUUID } from '../crypto.js';
import { queryFirst, runQuery, uniqueConstraintError } from '../db.js';
import { setSessionCookie, clearSessionCookie, sessionExpiration } from '../cookie.js';
import { requireAuth, getBanStatus } from '../auth.js';
import { rateLimit } from '../rate-limit.js';

const auth = new Hono<HonoEnv>();

auth.get('/health', (c) => c.json({ status: 'ok' }));

auth.get('/turnstile-sitekey', (c) => {
  const siteKey = c.env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    return jsonError(c, 'Turnstile site key not configured', 500);
  }
  return c.json({ siteKey });
});

auth.get('/check-username', async (c) => {
  const username = c.req.query('username')?.trim();
  if (!username || username.length < 3 || username.length > 32 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return c.json({ available: false });
  }

  const existing = await queryFirst<{ id: string }>(
    c,
    `SELECT id FROM users WHERE username = ?`,
    [username]
  );
  return c.json({ available: existing === null });
});

auth.post('/register', rateLimit('register', 5, 15 * 60 * 1000), async (c) => {
  const body = await c.req.json();
  const result = registerSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const { username, email, password, turnstileToken } = result.data;

  if (shouldRequireTurnstile(c)) {
    if (!turnstileToken) {
      return jsonError(c, 'Turnstile verification required', 400);
    }
    const valid = await verifyTurnstileToken(c, turnstileToken);
    if (!valid) {
      return jsonError(c, 'Turnstile verification failed', 400);
    }
  }

  const blacklisted = await queryFirst<{ email: string }>(
    c,
    `SELECT email FROM email_blacklist WHERE email = ?`,
    [email]
  );
  if (blacklisted) {
    return jsonError(c, 'This email address is not allowed to register', 403);
  }

  const hash = await hashPassword(password);
  const userId = randomUUID();
  const now = new Date().toISOString();

  try {
    await runQuery(
      c,
      `INSERT INTO users (id, username, email, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, username, email, hash, now]
    );
  } catch (err) {
    if (uniqueConstraintError(err)) {
      const message = String((err as { message?: string }).message ?? '');
      const field = message.toLowerCase().includes('email') ? 'Email' : 'Username';
      return jsonError(c, `${field} already taken`, 409);
    }
    throw err;
  }

  const sessionId = randomUUID();
  const expires = sessionExpiration();
  await runQuery(
    c,
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [sessionId, userId, expires.toISOString(), now]
  );
  setSessionCookie(c, sessionId, expires);

  const user = await queryFirst<
    {
      id: string;
      username: string;
      pfp_key: string | null;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
      created_at: string;
    }
  >(
    c,
    `SELECT id, username, pfp_key, first_name, last_name, bio, created_at
     FROM users WHERE id = ?`,
    [userId]
  );

  return c.json({ user: publicUser(user!, c.env.ADMINS) });
});

auth.post('/login', rateLimit('login', 10, 15 * 60 * 1000), async (c) => {
  const body = await c.req.json();
  const result = loginSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const { username, password } = result.data;

  const user = await queryFirst<
    {
      id: string;
      username: string;
      password_hash: string;
      pfp_key: string | null;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
      created_at: string;
    }
  >(
    c,
    `SELECT id, username, password_hash, pfp_key, first_name, last_name, bio, created_at
     FROM users WHERE username = ?`,
    [username]
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return jsonError(c, 'Invalid credentials', 401);
  }

  const banStatus = await getBanStatus(c, user.id);
  if (banStatus.banned) {
    const permanent = banStatus.bannedUntil && banStatus.bannedUntil.startsWith('9999');
    const message = permanent
      ? `Account permanently banned${banStatus.reason ? `: ${banStatus.reason}` : ''}`
      : `Account banned until ${new Date(banStatus.bannedUntil!).toLocaleString()}${banStatus.reason ? `: ${banStatus.reason}` : ''}`;
    return jsonError(c, message, 403);
  }

  const sessionId = randomUUID();
  const expires = sessionExpiration();
  await runQuery(
    c,
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [sessionId, user.id, expires.toISOString(), new Date().toISOString()]
  );
  setSessionCookie(c, sessionId, expires);

  return c.json({ user: publicUser(user, c.env.ADMINS) });
});

auth.post('/logout', requireAuth, async (c) => {
  const sessionId = c.req.header('Cookie')?.match(/(?:^|;\s*)sessionId=([^;]+)/)?.[1];
  if (sessionId) {
    await runQuery(c, `DELETE FROM sessions WHERE id = ?`, [decodeURIComponent(sessionId)]);
  }
  clearSessionCookie(c);
  return c.json({ success: true });
});

auth.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ user: publicUser(user!, c.env.ADMINS) });
});

export default auth;
