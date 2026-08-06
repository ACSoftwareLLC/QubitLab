# Agent Notes

## Project overview

QubitLab is a quantum-circuit designer and statevector simulator. The stack is hosted entirely on Cloudflare:

- **Frontend**: React + Vite, built into `dist/`, served as static assets from the Worker.
- **Simulator**: Rust crate in `simulator/`, compiled to WASM with `wasm-pack` into `src/wasm/pkg` (gitignored, rebuilt on every deploy).
- **Backend**: Single Cloudflare Worker using Hono (`src/worker/`).
- **Database**: Cloudflare D1 (`users`, `sessions`, `circuits`, `blogs`, `analytics_events`).
- **Object storage**: Cloudflare R2 buckets for avatars (`AVATARS`) and circuit thumbnails (`THUMBNAILS`).
- **Bot protection**: Cloudflare Turnstile on registration.

## Environments

| Environment | Branch | Worker name | D1 database | R2 buckets |
|-------------|--------|-------------|-------------|------------|
| local | any (not deployed) | `qubitlab` (wrangler dev --local) | local D1 file | local R2 files |
| dev | `develop` | `qubitlab-dev` | `qubitlab-dev` | `qubitlab-avatars-dev`, `qubitlab-thumbnails-dev` |
| production | `main` | `qubitlab` | `qubitlab` | `qubitlab-avatars`, `qubitlab-thumbnails` |

Configuration lives in `wrangler.jsonc`. The top-level configuration is used for `wrangler dev --local` and mirrors the dev environment for convenience.

## Secrets and vars

Vars (non-sensitive) are in `wrangler.jsonc` under `vars` or `env.<name>.vars`:

- `TURNSTILE_SITE_KEY` — public Turnstile site key.
- `ADMINS` — comma-separated list of admin usernames.
- `DISABLE_RATE_LIMIT` — optional; set to `"true"` to disable rate limiting.

Secrets (sensitive) must be set with `wrangler secret put` per environment:

```bash
# Dev
wrangler secret put SESSION_SECRET --env dev
wrangler secret put TURNSTILE_SECRET_KEY --env dev

# Production
wrangler secret put SESSION_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
```

For local development, create `.dev.vars` from `.dev.vars.example`:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with local secrets
```

## Common commands

### Build

```bash
# Build WASM simulator
npm run build:wasm

# Build the full static app (frontend + WASM)
npm run build

# Build everything
npm run build:worker
```

### Local development

```bash
# Terminal 1: run the Worker with local D1/R2
npm run dev:worker

# Terminal 2: run Vite dev server with HMR (proxies /auth to the Worker)
npm run dev

# Open http://localhost:5173
```

### Test

```bash
npm run test              # unit tests (Vitest)
npm run test:worker       # build + worker integration tests
npm run test:e2e        # Playwright tests against a running Worker
npm run test:e2e:ui     # Playwright tests in UI mode
```

For e2e tests, start the Worker first with `npm run dev:worker` (or use `QUBITLAB_BASE_URL` to point to a deployed instance). Set `QUBITLAB_DEV_USERNAME` and `QUBITLAB_DEV_PASSWORD` to override the seeded dev account used by the authenticated tests.

### Database

```bash
# Apply migrations locally
wrangler d1 migrations apply DB --local

# Apply migrations to remote dev
wrangler d1 migrations apply DB --env dev

# Seed the dev environment (remote)
npm run db:seed:dev -- --env dev

# Seed the local dev database
npm run db:seed:dev -- --local

# Dry-run the seed SQL
npm run db:seed:dev -- --dry-run
```

### Deploy

```bash
# Deploy to dev (used by the develop branch workflow)
npm run deploy

# Deploy to production (used by the main branch workflow)
npm run deploy:production
```

## Seeded dev accounts

After running the dev seed script, the following accounts are available:

- `devadmin` / `devpassword` — admin user (blog editor).
- `devuser` / `devpassword` — regular user.

### Deployment checks

Before deploying to a remote environment, run:

```bash
npm run check:deployment -- --env dev
```

This validates that the configured D1 database and R2 buckets exist for the target environment.

### Cron trigger

`wrangler.jsonc` configures a cron trigger that runs every 6 hours. The Worker deletes expired sessions via `src/worker/session.ts` during the scheduled event.

## Security settings

- **Sessions**: `sessionId` cookies use `HttpOnly`, `Secure`, `SameSite=Strict`, and a 7-day `Max-Age`.
- **Origin validation**: state-changing requests (`POST`, `PATCH`, `DELETE`, etc.) require the `Origin` header to match the request `Host` (skipped for `GET`, `HEAD`, `OPTIONS`, and missing origins).
- **Rate limiting**: auth routes (`/auth/register`, `/auth/login`) are rate-limited by client IP. Set `DISABLE_RATE_LIMIT=true` to disable (e.g., for production load testing).
- **CORS**: none — the app is same-origin, so frontend requests to `/auth/*` do not require CORS headers.
- **CSP**: enforced by the static asset handler via `wrangler.jsonc` (configure as needed for inline scripts/WASM).
- **Turnstile domains**: restrict the Turnstile widget to `localhost` and the deployed hostnames for each environment.
- **Error logging**: unhandled Worker errors are logged with request method, path, timestamp, and optional `CF-Ray` request ID.

## Coding conventions

- Worker code is in `src/worker/` and compiled against `@cloudflare/workers-types` via `tsconfig.worker.json`.
- Use `crypto.randomUUID()` for UUIDs, `crypto.subtle` for PBKDF2 and SHA-256, and `Uint8Array`/`atob`/`btoa` for binary data. No `Buffer` or Node-only crypto modules.
- Keep routes in `src/worker/routes/`; shared helpers in `src/worker/` root.
- D1 booleans are stored as `INTEGER` (`0`/`1`); JSON as `TEXT`.
- D1 timestamps are stored as ISO 8601 `TEXT` in UTC.
- Static assets are served by the Worker's asset handler; the SPA fallback is enabled in `wrangler.jsonc`.

## Notes for agents

- The legacy Docker/Fastify `auth-server` directory and `docker-compose.yml` have been removed as part of Phase 12 cleanup. All backend code lives in `src/worker/` and is deployed as a single Cloudflare Worker.
- Do not edit or create files outside the workspace without explicit user permission.
- Do not commit secrets or `.dev.vars` to git.
- Do not run `git commit` or `git push` unless explicitly requested.
- When modifying `wrangler.jsonc`, migrations, or the seed script, update this file and the root `README.md` if the change affects documented commands or resources.
