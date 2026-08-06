import type { HonoContext } from './types.js';

export type ErrorLog = {
  message: string;
  method: string;
  path: string;
  timestamp: string;
  stack?: string;
  requestId?: string;
  userId?: string;
};

export function buildErrorLog(c: HonoContext, error: unknown, requestId?: string): ErrorLog {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    message: err.message,
    method: c.req.method,
    path: c.req.path,
    timestamp: new Date().toISOString(),
    stack: err.stack,
    requestId,
    userId: c.get('user')?.id,
  };
}

export function logError(log: ErrorLog): void {
  if (log.stack) {
    console.error(`[ERROR] ${log.method} ${log.path}: ${log.message}`, log);
  } else {
    console.error(`[ERROR] ${log.method} ${log.path}: ${log.message}`, log);
  }
}

export function logRequestError(c: HonoContext, error: unknown, requestId?: string): void {
  logError(buildErrorLog(c, error, requestId));
}
