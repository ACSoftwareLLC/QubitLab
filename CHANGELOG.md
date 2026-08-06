# Changelog

All notable changes to the QubitLab Cloudflare-native migration are documented in this file. Each minor version corresponds to a phase in the migration plan.

## [0.12.0] — Cleanup

- Removed the legacy Docker/Fastify `auth-server` directory and `docker-compose.yml`.
- Removed the `auth-server/**` exclude from `vitest.config.ts`.
- Updated root `README.md` with Cloudflare deployment instructions and removed leftover Vite template boilerplate.
- Updated `AGENTS.md` with Cloudflare conventions, environment names, and seed commands.
- Updated `.env.example` to reflect only optional frontend/development variables.

## [0.11.0] — Testing and hardening

- Added Worker route integration tests, D1 repository tests, and R2 upload/download tests.
- Added Playwright end-to-end tests against a running Worker.
- Added test coverage for guest marketplace browsing, registration/login, session persistence, circuit CRUD and sharing, avatar and thumbnail uploads, blog admin workflows, Turnstile behavior, and password-change session invalidation.
- Added IP-based rate limiting for `/auth/register` and `/auth/login`.
- Added origin validation for state-changing requests.
- Added Worker error logging with request method, path, timestamp, and `CF-Ray` ID.
- Added a cron trigger that deletes expired sessions every 6 hours.
- Added deployment checks that verify configured D1 databases and R2 buckets exist.
- Documented security settings: cookie flags, CORS, CSP, and Turnstile domain restrictions.

## [0.10.0] — Dev environment replication

- Created dedicated Cloudflare dev resources: `qubitlab-dev` D1 database and `qubitlab-avatars-dev` / `qubitlab-thumbnails-dev` R2 buckets.
- Added `dev` and `production` environment overrides in `wrangler.jsonc`.
- Configured environment-specific vars and secrets (`SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `ADMINS`).
- Added `scripts/seed-dev.ts` and the `npm run db:seed:dev` command for local and remote seeding.
- Set up branch-based GitHub Actions deployments: `develop` → dev, `main` → production.
- Documented local development, remote deployment, and seeding workflows.

## [0.9.0] — Frontend and static asset deployment

- Configured Vite to build the React app into `dist/` for the Worker static asset handler.
- Kept the `/auth` proxy in `vite.config.ts` for local development only.
- Removed the production dependency on `auth-server/public/auth.html`.
- Ensured the WASM simulator bundle is included in the built static assets.
- Enabled SPA fallback so direct routes such as `/marketplace` and `/blog/:slug` load correctly.
- Verified that frontend `/auth/*` calls remain same-origin and that Turnstile loads the correct site key per environment.

## [0.8.0] — Analytics routes

- Implemented `POST /auth/analytics/track` for recording page views and events.
- Implemented admin-only analytics endpoints: summary, timeseries, geography, clients, pages, and events.
- Replaced Node `crypto.createHash` with Web Crypto SHA-256.
- Replaced `UAParser` with a Worker-compatible client parser.
- Converted Postgres analytics queries to SQLite-compatible equivalents.
- Used `executionCtx.waitUntil()` for non-critical analytics writes.

## [0.7.0] — Blog and user profile routes

- Implemented blog endpoints: list, get by slug, create, update, and delete (admin-only for writes).
- Added scheduled publishing filter (`publish_at <= now`) using SQLite timestamp comparisons.
- Implemented `GET /auth/users/:username` for public user profiles.
- Converted Postgres date expressions to SQLite-compatible comparisons.

## [0.6.0] — Marketplace routes

- Implemented public marketplace endpoints: list shared circuits, get a shared circuit, and fetch its thumbnail.
- Ensured marketplace routes do not require authentication.
- Reused private R2 buckets and served media through Worker routes.

## [0.5.0] — Circuit routes

- Implemented circuit CRUD endpoints: create, list, get, update, delete.
- Added thumbnail upload and retrieval backed by R2.
- Replaced MinIO `putObject`/`getObject`/`removeObject` with R2 bindings.
- Implemented PNG data URL decoding using `Uint8Array` and `atob`.
- Added `circuit_created` and `circuit_shared` analytics events.

## [0.4.0] — Authentication routes

- Implemented registration, login, logout, current-user, health-check, and Turnstile site-key routes.
- Added account-management routes for username, password, profile, and avatar updates.
- Added `GET /auth/users/:id/avatar` to stream avatars from R2.
- Hashed passwords with PBKDF2-HMAC-SHA-256 and stored them in `pbkdf2-sha256$iterations$salt$hash` format.
- Added IP-based rate limiting for registration and login.
- Added origin validation for state-changing requests.

## [0.3.0] — Worker runtime and shared infrastructure

- Created a typed Hono context carrying D1, R2, secrets, and the current session user.
- Added shared helpers for D1 queries, session lookup, Zod errors, Web Crypto hashing, UUID generation, client-IP extraction, R2 object operations, and `Uint8Array`/`atob`/`btoa` utilities.
- Implemented PBKDF2 password hashing and verification.
- Implemented `HttpOnly`, `Secure`, `SameSite=Strict` session cookies.
- Added admin authorization middleware.
- Added Turnstile token verification helper.

## [0.2.0] — D1 schema and migrations

- Created D1 migrations for `users`, `sessions`, `circuits`, `blogs`, and `analytics_events`.
- Mapped Postgres types to D1/SQLite equivalents:
  - `UUID` → `TEXT`
  - `JSONB` → `TEXT`
  - `TIMESTAMPTZ` → `TEXT` (ISO 8601 UTC)
  - `BOOLEAN` → `INTEGER` (`0`/`1`)
- Recreated equivalent indexes from the original Postgres schema.
- Applied migrations to the local D1 database.

## [0.1.0] — Cloudflare project foundation

- Added `wrangler.jsonc` with Worker configuration, static asset directory, SPA fallback, D1 binding, and R2 bucket bindings for `AVATARS` and `THUMBNAILS`.
- Added `@cloudflare/workers-types` and the Wrangler CLI as dev dependencies.
- Created `src/worker/index.ts` as the Worker entry point using Hono.
- Mounted `/auth/*` routes under Hono.
- Added `npm run dev:worker` and `npm run deploy` scripts.
- Verified that `wrangler dev` serves the frontend and `/auth/health` returns `{ status: "ok" }`.

## [0.0.1] — Pre-migration setup

- Decided on `qubitlab` as the final project name for Cloudflare resources.
- Removed `auth-server/Dockerfile` and `docker-compose.yml` from the deployment pipeline.
- Confirmed Rust and `wasm-pack` are available in CI; `src/wasm/pkg` is gitignored and rebuilt on every deploy.
