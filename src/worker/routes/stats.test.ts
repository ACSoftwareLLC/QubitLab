import { describe, it, expect } from 'vitest';
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
});
