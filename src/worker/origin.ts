import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const validateOrigin: MiddlewareHandler = (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  const origin = c.req.header('Origin');
  const host = c.req.header('Host');

  // If no origin is provided, allow the request (e.g., direct API calls or non-browser clients).
  if (!origin) {
    return next();
  }

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return Promise.resolve(jsonError(c, 'Invalid origin', 403));
    }
  } catch {
    return Promise.resolve(jsonError(c, 'Invalid origin', 403));
  }

  return next();
};
