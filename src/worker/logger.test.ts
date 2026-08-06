import { describe, it, expect, vi } from 'vitest';
import { buildErrorLog, logError, logRequestError } from './logger.js';
import type { HonoContext } from './types.js';

describe('logger', () => {
  it('builds an error log from a context and Error', () => {
    const c = {
      req: { method: 'POST', path: '/auth/test' },
      get: () => ({ id: 'user-1' }),
    } as unknown as HonoContext;

    const log = buildErrorLog(c, new Error('Something broke'), 'req-1');
    expect(log.message).toBe('Something broke');
    expect(log.method).toBe('POST');
    expect(log.path).toBe('/auth/test');
    expect(log.userId).toBe('user-1');
    expect(log.requestId).toBe('req-1');
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(log.stack).toContain('Error: Something broke');
  });

  it('builds an error log from a non-Error value', () => {
    const c = {
      req: { method: 'GET', path: '/auth/health' },
      get: () => null,
    } as unknown as HonoContext;

    const log = buildErrorLog(c, 'string error');
    expect(log.message).toBe('string error');
    expect(log.userId).toBeUndefined();
  });

  it('logs to console.error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError({
      message: 'boom',
      method: 'GET',
      path: '/',
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      expect.objectContaining({ path: '/' })
    );
    consoleSpy.mockRestore();
  });

  it('logRequestError delegates to console.error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = {
      req: { method: 'POST', path: '/auth/test' },
      get: () => null,
    } as unknown as HonoContext;

    logRequestError(c, new Error('request failed'), 'ray-1');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('request failed'),
      expect.objectContaining({ requestId: 'ray-1' })
    );
    consoleSpy.mockRestore();
  });
});
