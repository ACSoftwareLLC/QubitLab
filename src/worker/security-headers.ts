/**
 * Browser security headers applied to all Worker responses (API routes and
 * static assets). Keep this in sync with the frontend's capabilities:
 * - WASM execution requires 'wasm-unsafe-eval'.
 * - Turnstile loads scripts/styles from challenges.cloudflare.com.
 * - Some UI components rely on inline styles, so 'unsafe-inline' is kept for
 *   style-src (XSS risk is mitigated by DOMPurify on all HTML sinks).
 */

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "script-src 'self' https://challenges.cloudflare.com 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self'; " +
  "frame-src https://challenges.cloudflare.com; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

export function securityHeaderMap(): Record<string, string> {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaderMap())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
