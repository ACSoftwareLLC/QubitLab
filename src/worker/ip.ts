import type { HonoContext } from './types.js';

export function getClientIp(c: HonoContext): string {
  const cfIp = c.req.header('CF-Connecting-IP');
  if (cfIp) return cfIp;

  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return '0.0.0.0';
}
