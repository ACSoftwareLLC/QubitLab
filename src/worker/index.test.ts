import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from './index.js';
import { resetRateLimits } from './rate-limit.js';

function mockD1(): D1Database {
  const prepared = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
    raw: vi.fn(),
  };
  return {
    prepare: vi.fn().mockReturnValue(prepared),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

function mockR2(): R2Bucket {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

function makeEnv() {
  return {
    DB: mockD1(),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
    DISABLE_RATE_LIMIT: 'true',
  };
}

describe('global middleware', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('returns 400 for malformed JSON on state-changing routes', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not json',
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid JSON');
  });

  it('returns 413 for JSON bodies exceeding 1 MB', async () => {
    const bigBody = JSON.stringify({ username: 'x'.repeat(2_000_000) });

    const res = await app.fetch(
      new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(bigBody.length),
        },
        body: bigBody,
      }),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Request body too large');
  });

  it('does not enforce size limits on GET requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/health'),
      makeEnv() as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
  });
});
