import type { MiddlewareHandler } from 'hono';
import { jsonError } from './errors.js';

/** Maximum JSON body size for state-changing API requests (1 MB). */
export const MAX_JSON_BODY_SIZE = 1_048_576;

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().startsWith('application/json') ?? false;
}

function isStateChangingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE';
}

function parseContentLength(header: string | undefined): number | null {
  if (!header) return null;
  const value = Number(header);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Validates and eagerly parses JSON bodies.
 *
 * - Rejects requests whose Content-Length exceeds MAX_JSON_BODY_SIZE with 413.
 * - For state-changing requests with JSON Content-Type, parses the body early
 *   so that malformed JSON is surfaced as 400 rather than falling through to
 *   the global 500 error handler. Hono caches the parsed body, so route handlers
 *   calling c.req.json() receive the same result without re-parsing.
 */
export const jsonBodyMiddleware: MiddlewareHandler = async (c, next) => {
  const contentType = c.req.header('Content-Type');

  if (isJsonContentType(contentType)) {
    const method = c.req.method;
    const contentLength = parseContentLength(c.req.header('Content-Length'));

    if (contentLength !== null && contentLength > MAX_JSON_BODY_SIZE) {
      return jsonError(c, 'Request body too large', 413);
    }

    if (isStateChangingMethod(method)) {
      try {
        await c.req.json();
      } catch (err) {
        if (err instanceof SyntaxError || (err instanceof Error && err.name === 'SyntaxError')) {
          return jsonError(c, 'Invalid JSON', 400);
        }
        throw err;
      }
    }
  }

  return next();
};
