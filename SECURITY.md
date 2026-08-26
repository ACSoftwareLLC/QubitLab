# Security Policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-for-reporting-security-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository. Do **not** open a public issue for anything you believe is exploitable.

Include a description, reproduction steps, and affected URLs/routes where possible.
You can expect an initial response within a few days. Please allow reasonable time
for a fix before public disclosure.

## Scope

- The Cloudflare Worker API (`src/worker/`) and its D1/R2 data.
- The React frontend served as static assets (`src/`, built into `dist/`).
- The WASM quantum simulator (`simulator/`), which runs client-side.

Out of scope: Cloudflare's edge/dashboard infrastructure itself, and vulnerabilities
that require a malicious authenticated admin (admins manage all content by design).

## Threat model summary

QubitLab is a single-origin, same-origin application: the Worker serves both the
static frontend and the `/auth/*` API. There is no CORS surface. Key properties:

- **Auth**: session cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, 7-day expiry;
  session tokens are stored SHA-256-hashed in D1; passwords use PBKDF2-HMAC-SHA-256
  (600k iterations) and legacy hashes upgrade transparently at login.
- **Authorization**: admin capability is a database column (`users.is_admin`); blog
  writes and analytics reads require it.
- **Input handling**: zod validation on request bodies; parameterized SQL throughout;
  size caps on bodies, arrays, and lists; per-user circuit quotas.
- **XSS**: blog HTML is sanitized with DOMPurify at every render sink; a strict CSP
  (`default-src 'self'`, `wasm-unsafe-eval` for the simulator, frame-limited to
  Cloudflare challenges) is applied to API and asset responses.
- **Abuse prevention**: IP rate limiting on auth, circuit creation, avatar uploads,
  and analytics ingestion; Cloudflare Turnstile on registration; analytics events are
  stored as salted hashes with capped metadata.
- **Uploads**: avatars/thumbnails get magic-byte validation, `nosniff`, and
  `Content-Disposition: inline`; object keys are server-generated.
- **Supply chain**: third-party GitHub Actions are pinned by commit SHA; dependencies
  are audited in CI (`npm audit --audit-level=high`) and kept current via Dependabot.

## Accepted risks

These are known limitations we have consciously accepted rather than fixed:

- **Public username enumeration via profiles** — usernames are public identifiers
  by design (profiles and marketplace attribution).
- **Login/register timing reveals nothing beyond rate limits** — unknown usernames
  still perform a full PBKDF2 verification; residual timing differences from D1
  lookups remain possible but reveal only what public profile pages already show.
- **`X-Forwarded-For` fallback in local dev only** (`src/worker/ip.ts`) — never used
  for client IP determination in production.
- **Turnstile widget loaded site-wide** — robustness/privacy tradeoff of embedding
  the challenge script globally instead of only on registration.
- **CSRF defense-in-depth relies on one primary layer** — state-changing requests
  validate the `Origin` header, but non-browser clients may omit `Origin`;
  `SameSite=Strict` cookies are then the remaining barrier.
- **Public payloads expose a staff `badge`, not the authorization flag** — public
  profiles, marketplace entries, and blog author chips expose a presentational
  `badge: 'admin'` (needed to render admin badges) and year-granularity
  `memberSince` instead of the raw `isAdmin` column or exact creation timestamp.
  Exact values remain available only on self endpoints (`/auth/me`, account updates).

## Supported versions

Only the latest `main` branch (deployed to production) receives security fixes.
The `dev` branch receives fixes opportunistically before promotion.
