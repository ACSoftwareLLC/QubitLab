import { describe, it, expect, vi } from 'vitest';
import app from '../index.js';
import { mockExecutionCtx, makeEnv } from '../test-helpers.js';

describe('stats routes', () => {
  it('returns site statistics', async () => {
    const env = makeEnv({
      'FROM circuits WHERE shared = 1 AND shared_at >': () => [{ count: 3 }],
      'FROM circuits WHERE shared = 1': () => [{ count: 12 }],
      'FROM circuits': () => [{ count: 150 }],
      'FROM users': () => [{ count: 42 }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/stats'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      users: 42,
      circuits: 150,
      shared: 12,
      sharedThisWeek: 3,
    });
  });

  it('returns zeros when no data exists', async () => {
    const env = makeEnv({
      'FROM circuits WHERE shared = 1 AND shared_at >': () => [{ count: 0 }],
      'FROM circuits WHERE shared = 1': () => [{ count: 0 }],
      'FROM circuits': () => [{ count: 0 }],
      'FROM users': () => [{ count: 0 }],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/stats'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      users: 0,
      circuits: 0,
      shared: 0,
      sharedThisWeek: 0,
    });
  });

  it('only counts shares from the last 7 days for sharedThisWeek', async () => {
    let sharedAtThreshold: string | null = null;
    const env = makeEnv({
      'FROM circuits WHERE shared = 1 AND shared_at >': (sql, params) => {
        sharedAtThreshold = params[0] as string;
        return [{ count: 5 }];
      },
      'FROM circuits WHERE shared = 1': () => [{ count: 100 }],
      'FROM circuits': () => [{ count: 200 }],
      'FROM users': () => [{ count: 50 }],
    });

    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-06T12:00:00Z'));

    const res = await app.fetch(
      new Request('http://localhost/auth/stats'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sharedThisWeek: number; shared: number };
    expect(body.sharedThisWeek).toBe(5);
    expect(body.shared).toBe(100);
    expect(sharedAtThreshold).toBe(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    vi.restoreAllMocks();
  });
});
