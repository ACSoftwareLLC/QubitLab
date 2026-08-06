# Cloudflare Native Migration TODO

> Target: move the entire QubitLab stack — React frontend, WASM simulator, and Fastify backend — onto Cloudflare using a single Worker, D1, R2, and Turnstile.
>
> Scope decisions:
> - **Zero data migration** is required (no users, no valuable objects in Postgres/MinIO).
> - **No legacy password support** needed; use Web Crypto PBKDF2 for all new accounts.
> - **One Worker** serves both the static React app and the `/auth/*` API.
> - **Same-origin deployment** keeps the existing frontend `/auth/...` calls unchanged.

## Repository changes before work starts

- [x] Decide final project name for Cloudflare resources.
- [x] Remove or archive `auth-server/Dockerfile` and `docker-compose.yml` from the deployment pipeline.
- [x] Confirm Rust + `wasm-pack` are available in CI (the generated `src/wasm/pkg` is gitignored and must be rebuilt on every deploy).

## Phase 1 — Cloudflare project foundation

Goal: create a deployable Worker with local and remote development environments.

- [ ] Add `wrangler.jsonc` (or `wrangler.toml`) with:
  - Worker name and compatibility date.
  - Static asset directory pointing to the Vite `dist` output.
  - SPA `not_found_handling = "single-page-application"` fallback.
  - D1 database binding.
  - R2 bucket bindings for `AVATARS` and `THUMBNAILS`.
  - Environment-specific overrides for `dev` and `production`.
- [ ] Add `workers-types` and install Wrangler CLI.
- [ ] Create `src/worker/index.ts` or `worker/index.ts` as the Worker entry point.
- [ ] Add Hono and route mounting for `/auth/*`.
- [ ] Add `npm run dev:worker` and `npm run deploy` scripts.
- [ ] Verify `wrangler dev` serves the frontend and `/auth/health` returns `{ status: "ok" }`.

## Phase 2 — D1 schema and migrations

Goal: replace PostgreSQL with a fresh D1 schema.

- [x] Create D1 migrations for:
  - `users`
  - `sessions`
  - `circuits`
  - `blogs`
  - `analytics_events`
- [x] Define column mappings:
  - `UUID` → `TEXT` (generated with `crypto.randomUUID()`).
  - `JSONB` → `TEXT` (serialized JSON).
  - `TIMESTAMPTZ` → `TEXT` (ISO 8601 UTC).
  - `BOOLEAN` → `INTEGER` (`0`/`1`).
- [x] Create equivalent indexes from the original Postgres migrations.
- [x] Apply migrations locally:
  ```bash
  wrangler d1 migrations apply DB --local
  ```
- [ ] Apply migrations to the remote dev database:
  ```bash
  wrangler d1 migrations apply DB --env dev
  ```
- [ ] Apply migrations to production when ready.

## Phase 3 — Worker runtime and shared infrastructure

Goal: replace Fastify and Node-only dependencies with a Hono/Worker runtime.

- [x] Create a typed Hono context that carries:
  - D1 database binding.
  - R2 bucket bindings.
  - Environment secrets (`SESSION_SECRET`, `TURNSTILE_SECRET_KEY`).
  - Parsed current user from session cookie.
- [x] Implement shared helpers:
  - D1 query wrapper with result normalization.
  - Session lookup and cookie parser.
  - Zod error handling.
  - Web Crypto hashing (SHA-256, PBKDF2).
  - `crypto.randomUUID()` replacement.
  - Client IP extraction from `CF-Connecting-IP`.
  - R2 object upload/download/delete.
  - `Uint8Array`/`atob`/`btoa` utilities to replace `Buffer`.
- [x] Implement password helpers:
  - Hash new passwords with PBKDF2-HMAC-SHA-256.
  - Format: `pbkdf2-sha256$iterations$salt$hash`.
  - Verify password against stored hash.
- [x] Implement cookie helpers:
  - `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
  - Set and clear `sessionId` cookie.
- [x] Implement admin authorization middleware.
- [x] Implement Turnstile token verification helper.

## Phase 4 — Authentication routes

Goal: port `/auth/*` account and session routes.

- [x] `POST /auth/register` — validate username/password, verify Turnstile, create PBKDF2 hash, create user and session, set cookie.
- [x] `POST /auth/login` — validate credentials, create session, set cookie.
- [x] `POST /auth/logout` — delete session, clear cookie.
- [x] `GET /auth/me` — return current user from session cookie.
- [x] `GET /auth/health` — health check.
- [x] `GET /auth/turnstile-sitekey` — return configured site key.
- [x] `PATCH /auth/account/username` — update username with unique constraint check.
- [x] `PATCH /auth/account/password` — verify current password, rehash new password, invalidate other sessions.
- [x] `PATCH /auth/account/profile` — update first/last name and bio.
- [x] `POST /auth/account/avatar` — validate image upload, store in R2, update user `pfp_key`, remove old avatar.
- [x] `GET /auth/users/:id/avatar` — stream avatar from R2 with correct `Content-Type`.
- [x] Add rate limiting for registration and login.
- [x] Add origin validation for state-changing requests.

## Phase 5 — Circuit routes

Goal: port `/auth/circuits/*`.

- [x] `POST /auth/circuits` — create circuit with optional thumbnail.
- [x] `GET /auth/circuits` — list current user’s circuits.
- [x] `GET /auth/circuits/:id` — get owned circuit.
- [x] `PATCH /auth/circuits/:id` — update name, circuit JSON, thumbnail, shared flag.
- [x] `DELETE /auth/circuits/:id` — delete circuit and its thumbnail.
- [x] `GET /auth/circuits/:id/thumbnail` — return circuit thumbnail from R2.
- [x] Replace MinIO `putObject`/`getObject`/`removeObject` with R2 bindings.
- [x] Implement PNG data URL decoding using `Uint8Array` and `atob`.
- [x] Record `circuit_created` and `circuit_shared` analytics events.

## Phase 6 — Marketplace routes

Goal: port public `/auth/marketplace/*`.

- [x] `GET /auth/marketplace` — list shared circuits with user profile data.
- [x] `GET /auth/marketplace/:id` — get a shared circuit.
- [x] `GET /auth/marketplace/:id/thumbnail` — return shared circuit thumbnail from R2.
- [x] Ensure public routes do not require authentication.
- [x] Reuse the same private R2 buckets; serve media through Worker routes.

## Phase 7 — Blog and user profile routes

Goal: port `/auth/blogs/*` and `/auth/users/*`.

- [x] `GET /auth/blogs` — list published posts (admin sees all).
- [x] `GET /auth/blogs/:slug` — get published post (admin sees all).
- [x] `POST /auth/blogs` — admin-only create.
- [x] `PATCH /auth/blogs/:slug` — admin-only update.
- [x] `DELETE /auth/blogs/:slug` — admin-only delete.
- [x] Implement scheduled publishing filter (`publish_at <= now`).
- [x] `GET /auth/users/:username` — public user profile.
- [x] Convert Postgres date expressions to SQLite-compatible timestamp comparisons.

## Phase 8 — Analytics routes

Goal: port `/auth/analytics/*`.

- [x] `POST /auth/analytics/track` — record page view/event.
- [x] `GET /auth/analytics/summary` — admin-only summary.
- [x] `GET /auth/analytics/timeseries` — admin-only timeseries.
- [x] `GET /auth/analytics/geography` — admin-only geography breakdown.
- [x] `GET /auth/analytics/clients` — admin-only client breakdown.
- [x] `GET /auth/analytics/pages` — admin-only page breakdown.
- [x] `GET /auth/analytics/events` — admin-only event list.
- [x] Replace `crypto.createHash` with Web Crypto SHA-256.
- [x] Replace `UAParser` usage with a Worker-compatible parser or lightweight regex helper.
- [x] Convert `COUNT(DISTINCT ...)`, `DATE(...)`, and Postgres-specific functions to SQLite equivalents.
- [x] Use `executionCtx.waitUntil()` for non-critical analytics writes where appropriate.

## Phase 9 — Frontend and static asset deployment

Goal: deploy the existing React app from the Worker.

- [x] Update Vite build to produce the Worker static asset directory.
- [x] Keep the `/auth` proxy in `vite.config.ts` only for local development.
- [x] Remove the production dependency on `auth-server/public/auth.html`.
- [x] Ensure the WASM bundle is included in the static assets.
- [x] Add SPA fallback so direct URLs like `/marketplace` or `/blog/foo` load correctly.
- [x] Verify that relative `/auth/*` calls in the frontend still work.
- [x] Verify Turnstile widget loads and uses the correct site key per environment.

## Phase 10 — Dev environment replication

Goal: create local and remote dev environments that mirror production.

- [x] Create dedicated Cloudflare resources:
  - D1 database: `qubitlab-dev`.
  - R2 buckets: `qubitlab-avatars-dev`, `qubitlab-thumbnails-dev`.
  - Turnstile widget: dev keys restricted to the dev domain.
- [x] Configure `wrangler.jsonc` environments for `dev` and `production`.
- [x] Set environment-specific secrets:
  - `SESSION_SECRET`
  - `TURNSTILE_SECRET_KEY`
  - `TURNSTILE_SITE_KEY`
  - `ADMINS`
- [x] Create a seed script (`scripts/seed-dev.ts`) that populates dev D1 with:
  - A development admin user.
  - Sample circuits.
  - Sample marketplace entries.
  - Sample blog posts.
- [x] Add `npm run db:seed:dev` script.
- [x] Set up branch-based deployment:
  - `main` → production.
  - `develop` → dev environment.
- [x] Document how to run local dev:
  ```bash
  npm run build:wasm
  npm run build
  wrangler dev --local
  ```
- [x] Document how to deploy to remote dev:
  ```bash
  wrangler deploy --env dev
  wrangler d1 migrations apply DB --env dev
  npm run db:seed:dev -- --env dev
  ```

## Phase 11 — Testing and hardening

Goal: verify parity with the existing backend and add production safeguards.

- [x] Add Worker route tests using Miniflare/wrangler.
- [x] Add D1 repository tests.
- [x] Add R2 upload/download tests.
- [x] Add Playwright end-to-end tests running against `wrangler dev`.
- [x] Add tests for:
  - Guest marketplace browsing.
  - Registration and login.
  - Session persistence across reloads.
  - Circuit CRUD and sharing.
  - Avatar upload and display.
  - Thumbnail upload and display.
  - Blog admin create/update/publish.
  - Turnstile behavior in dev mode.
  - Password change invalidating other sessions.
- [x] Add rate limiting for auth routes.
- [x] Add origin validation on state-changing endpoints.
- [x] Add Worker error logging.
- [x] Add a Cron Trigger to delete expired sessions.
- [x] Add deployment checks for D1 migrations and R2 bucket existence.
- [x] Document security settings: cookie flags, CORS, CSP, Turnstile domains.

## Phase 12 — Cleanup

- [x] Remove `auth-server` from the production deployment path.
- [x] Archive or delete unused `docker-compose.yml` and `auth-server/Dockerfile`.
- [x] Update root `README.md` with Cloudflare deployment instructions.
- [x] Update `AGENTS.md` with Cloudflare conventions, environment names, and seed commands.
- [x] Update `.env.example` to reflect only frontend/development variables if still needed.

## Not in scope

- Migrating PostgreSQL data.
- Migrating MinIO objects.
- Supporting legacy bcrypt password hashes.
- Running Fastify inside a Worker.
- Cross-origin CORS configuration (same-origin Worker keeps `/auth/*` calls unchanged).

## Useful commands

```bash
# Build the WASM simulator
npm run build:wasm

# Build the React app
npm run build

# Run local Worker with local D1/R2
wrangler dev --local

# Apply D1 migrations to dev
wrangler d1 migrations apply DB --env dev

# Deploy to dev
wrangler deploy --env dev

# Seed dev database
npm run db:seed:dev -- --env dev

# Deploy to production
wrangler deploy --env production
```



