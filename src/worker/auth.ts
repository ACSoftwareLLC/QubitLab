import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'Unauthorized', 401);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'Unauthorized', 401);
  }
  if (!user.isAdmin) {
    return jsonError(c, 'Forbidden', 403);
  }
  await next();
};
