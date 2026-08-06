import type { Context } from 'hono';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function setSessionCookie(c: Context, sessionId: string, expires: Date) {
  const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000);
  const value = encodeURIComponent(sessionId);
  c.header(
    'Set-Cookie',
    `sessionId=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
    { append: true }
  );
}

export function clearSessionCookie(c: Context) {
  c.header('Set-Cookie', 'sessionId=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0', {
    append: true,
  });
}

export function sessionExpiration(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_MS);
}
