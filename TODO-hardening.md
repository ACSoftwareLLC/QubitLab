# QubitLab Platform Hardening Plan

Security hardening roadmap based on a full-platform audit (Worker routes, frontend, infra/CI/config).
Approach: 5 small, independently shippable PRs, ordered so each phase reduces the risk the next one assumes.

**Locked-in decisions:**
- Admin privileges: DB `is_admin` column (replaces `ADMINS` env-var matching)
- Rate limiting: D1-backed limiter (replaces per-isolate in-memory Map)
- Sequencing: small phased PRs

## Manual actions required (out-of-band, cannot be scripted)

- [ ] Create a real Turnstile widget for the production domain in the Cloudflare dashboard
  - Put the site key in `wrangler.jsonc` (production env), replacing the dummy key `3x00000000000000000000FF`
  - `wrangler secret put TURNSTILE_SECRET_KEY --env production`
  - Restrict the widget to the deployed hostnames
- [ ] After Phase 2 migration lands: grant admins via
  `wrangler d1 execute DB --env production --command "UPDATE users SET is_admin = 1 WHERE username IN ('alex')"`
- [ ] Enable HSTS at the Cloudflare edge (dashboard)

---

## Phase 1 (PR 1) — Abuse prevention: rate limiting, Turnstile, analytics flooding

Fixes the two actively-open production holes: unlimited login/register attempts and unlimited unauthenticated D1 writes.

### Migration `0002_rate_limits.sql`
- [x] `rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at TEXT NOT NULL)` + index on `reset_at`

### Code
- [x] `src/worker/rate-limit.ts` — rewrite as async D1-backed fixed-window limiter (UPSERT … `ON CONFLICT DO UPDATE` comparing `reset_at`; reset when expired). Keep `DISABLE_RATE_LIMIT` escape hatch for local/tests only. On D1 error: fail open + `console.error` (avoid self-DoS)
- [x] `wrangler.jsonc` — remove `DISABLE_RATE_LIMIT: "true"` from production
- [x] `src/worker/turnstile.ts` + `src/worker/routes/auth.ts` — fail closed when keys are configured but verification errors; make "verification skipped" an explicit local-only path
- [x] Extend the 6-hour cron (`src/worker/index.ts` / `session.ts`) to purge expired `rate_limits` rows
- [x] Extend limiter coverage: `account/password` (~10/15min), `account/avatar` (~20/15min), `POST /circuits` (~30/15min), `POST /analytics/track` (~60/1min per IP) — plus existing register/login limits
- [x] `src/worker/schemas.ts` — cap `metadata` on the track event (max ~1 KB serialized, shallow record of primitives)
- [x] `scripts/seed-dev.ts` — hard-refuse `--env production` / `--remote` against production

### Tests
- [x] New `src/worker/rate-limit.test.ts` (window expiry, per-key isolation, disabled flag)
- [x] Turnstile fail-closed tests
- [x] `/track` 429 test
- [x] Update `src/worker/test-helpers.ts` to exercise enforcement rather than blanket-disabling

---

## Phase 2 (PR 2) — Identity & session: admin role column, hashed sessions

Removes the privilege-escalation design flaw; limits blast radius of a DB read.

### Migration `0005_admin_and_session_hardening.sql`
- [x] `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1))`
- [x] Optional: case-insensitive username uniqueness via UNIQUE index on `username COLLATE NOCASE` (pre-check for existing conflicts first) — kills `Alex`/`alex` impersonation

### Code
- [x] `src/worker/session.ts` — `getSessionUser` selects `u.is_admin` from the JOIN; drop `ADMINS` env parsing
- [x] `src/worker/routes/auth.ts` (`requireAdmin`), `src/worker/routes/blogs.ts` (`isAdminRequest`), `src/worker/types.ts` (`publicUser`) — read `is_admin` from the user row
- [x] Session tokens hashed at rest: login/register store `SHA-256(sessionId)` in `sessions.id`; `getSessionUser` hashes the cookie value before lookup. Existing sessions invalidate → one-time forced re-login (acceptable). No schema change needed
- [x] `scripts/seed-dev.ts` — set `is_admin = 1` for `devadmin`
- [x] Docs: `AGENTS.md` + `README.md` — replace `ADMINS` var docs with the `wrangler d1 execute … UPDATE users SET is_admin = 1` grant procedure

### Tests
- [x] Non-admin → 403 on blog CRUD/analytics; admin via DB flag → 200
- [x] Username in `ADMINS` env no longer grants anything
- [x] Session lookup works with hashed IDs; old plaintext session IDs rejected

---

## Phase 3 (PR 3) — XSS & browser hardening: sanitization, CSP, headers, uploads

Breaks the stored-XSS chain and adds the currently-missing browser security controls.

### Frontend
- [ ] Add `dompurify` dependency; sanitize at all three sinks (`src/pages/BlogPostPage.tsx:68`, `src/pages/BlogPage.tsx:99`, `src/pages/HomePage.tsx:124`) and before loading HTML into `src/components/WysiwygEditor.tsx:17`
- [ ] Fix excerpt slicing to sanitize then truncate safely
- [ ] `WysiwygEditor.tsx` — allowlist `https:`/`mailto:` on `insertLink`; validate `insertImage` URLs

### Worker
- [ ] Security-headers middleware in `src/worker/index.ts` (use `hono/secure-headers` or hand-roll), applied to API and asset responses:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' https://challenges.cloudflare.com 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`
- [ ] `src/worker/r2.ts` — add `nosniff` + `Content-Disposition: inline` and `Cache-Control` on avatar serves; reflect only allowlisted content types
- [ ] `src/worker/routes/account.ts` — avatar magic-byte validation (reuse the PNG/JPEG/WEBP sniffing in `src/worker/buffer.ts`), reject mismatches
- [ ] `AGENTS.md` — fix the false "CSP enforced" claim to describe the real middleware

### Tests
- [ ] Header assertions on API + asset responses
- [ ] Sanitizer unit tests (script/event-handler/`javascript:` URLs stripped)
- [ ] Avatar upload with mismatched magic bytes → 400
- [ ] E2E smoke to confirm Turnstile + WASM still work under CSP

---

## Phase 4 (PR 4) — Resource quotas & robustness

Closes the cost-exhaustion/DoS vectors and correctness bugs in security controls.

- [ ] `src/worker/schemas.ts`: password `.max(128)`; cap `ops` array length, `targets`/`controls` lengths, gate `type` length; blog list/query caps
- [ ] `src/worker/routes/circuits.ts`: per-user circuit count quota (e.g. 100) → 403/413 with clear error
- [ ] `src/worker/routes/blogs.ts`: `LIMIT` on list endpoint + server-side excerpt (stop shipping full `content` for every post)
- [ ] `src/worker/routes/blogs.ts`: fix `VISIBILITY_FILTER` datetime bug — compare against an ISO `?` param instead of `datetime('now')`
- [ ] `src/worker/routes/blogs.ts`: guard empty slugs after `slugify`
- [ ] `src/worker/index.ts` / `errors.ts`: body-size guard via `Content-Length` check on JSON routes (e.g. 1 MB); malformed JSON → 400 instead of 500
- [ ] Frontend: clamp `numBits <= 16` in `src/api/deserialize.ts` / `src/hooks/useCanvasState.ts` when loading marketplace circuits

### Tests
- [ ] Quota exhaustion → 4xx; oversized bodies → 413; malformed JSON → 400
- [ ] Scheduled post publishes same-day (visibility filter fix)
- [ ] Crafted 30-bit marketplace circuit clamps to 16

---

## Phase 5 (PR 5) — Crypto, CI & process hygiene

- [ ] `src/worker/password.ts`: PBKDF2 100k → 600k iterations (OWASP SHA-256 guidance; format embeds iteration count so old hashes still verify and upgrade on next login/change). Verify login latency impact
- [ ] `src/worker/routes/auth.ts` login: dummy PBKDF2 verify when the user doesn't exist → closes the timing oracle
- [ ] CI: pin third-party actions by commit SHA (`jetli/wasm-pack-action`, `actions-rust-lang/setup-rust-toolchain`, `cloudflare/wrangler-action`)
- [ ] CI: delete duplicate `tests.yml` (identical to `ci.yml`); add `npm audit --audit-level=high` step + Dependabot config
- [ ] Add `SECURITY.md` (reporting policy, threat-model summary, accepted risks)
- [ ] Decide + document (accepted risk or fix): public exposure of `isAdmin`/`createdAt` on public profiles & marketplace payloads

---

## Verification (every phase)

```bash
npm run test && npm run test:worker     # unit + worker integration
npm run dev:worker & npm run test:e2e   # e2e against local worker
npm run check:deployment -- --env dev   # before any remote deploy
```

## Accepted risks to document (not fixed)

- Public username enumeration via public profiles (by design)
- X-Forwarded-For fallback in local dev only (`src/worker/ip.ts`)
- Turnstile loaded site-wide (robustness/privacy note only)
- Missing-Origin allowance for non-browser clients — CSRF rests on `SameSite=Strict` (single layer, documented)

## Audit findings reference (what each phase fixes)

| Severity | Finding | Phase |
|---|---|---|
| High | Rate limiting disabled in production (`wrangler.jsonc`) + per-isolate limiter | 1 |
| High | Turnstile dummy key in production + fail-open verification | 1 |
| High | `POST /auth/analytics/track` unauthenticated + unrate-limited | 1 |
| High | Admin-by-username privilege escalation (`ADMINS` env var) | 2 |
| High | Stored XSS: unsanitized blog HTML → 3 `dangerouslySetInnerHTML` sinks, no CSP | 3 |
| Med | No security headers at all (nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy) | 3 |
| Med | Avatar upload trusts client MIME, served same-origin without nosniff | 3 |
| Med | No quotas (unbounded circuit ops/arrays, body sizes, per-user circuits, blog list) | 4 |
| Med | Destructive seed script accepts `--env production` | 1 |
| Med | Session tokens stored unhashed in D1; `SESSION_SECRET` unused | 2 |
| Med | `VISIBILITY_FILTER` datetime bug (fails closed, availability) | 4 |
| Low | PBKDF2 100k iterations; no password max length; login timing oracle | 4, 5 |
| Low | GH Actions tag-pinned; duplicate workflows; no npm audit/Dependabot | 5 |
| Low | Username case-sensitivity impersonation; public `isAdmin` exposure | 2, 5 |
| Low | Malformed JSON → 500 instead of 400; `numBits` not clamped client-side | 4 |

**Solid foundations to keep:** parameterized SQL everywhere, strong cookie flags + `SameSite=Strict`, zod validation (mass-assignment resistant), server-generated R2 keys, uniform auth errors, no secrets in git history, analytics stores only hashe
