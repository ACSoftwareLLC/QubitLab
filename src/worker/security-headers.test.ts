import { describe, it, expect, vi } from 'vitest';
import app from './index.js';
import { securityHeaderMap, CONTENT_SECURITY_POLICY, applySecurityHeaders } from './security-headers.js';
import { mockExecutionCtx, makeEnv, ADMIN_COOKIE } from './test-helpers.js';

describe('security headers', () => {
  it('exposes the expected header map', () => {
    const headers = securityHeaderMap();
    expect(headers['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('applies headers to an existing response', () => {
    const response = new Response('ok');
    const hardened = applySecurityHeaders(response);
    expect(hardened.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(hardened.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('adds security headers to API responses', async () => {
    const env = makeEnv();
    const res = await app.fetch(
      new Request('http://localhost/auth/account/username', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newalice' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('adds security headers to static asset responses', async () => {
    const assetResponse = new Response('asset body', {
      headers: { 'Content-Type': 'text/html' },
    });
    const assets = {
      fetch: vi.fn().mockResolvedValue(assetResponse),
    };
    const env = makeEnv({}, undefined, { ASSETS: assets as unknown as Fetcher });

    const res = await app.fetch(
      new Request('http://localhost/'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(assets.fetch).toHaveBeenCalled();
    expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
