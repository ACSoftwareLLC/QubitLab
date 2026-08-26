# QubitLab

A quantum-circuit designer frontend (React + Vite) with an in-browser simulation engine (Rust compiled to WASM, see `simulator/`) and a Cloudflare Worker backend (D1, R2, Turnstile).

## Simulation engine

The quantum statevector simulator is a Rust crate in `simulator/`, compiled to
WASM and executed in the browser — no simulation backend is required. The
data contract is documented in `docs/api.md`.

Prerequisites: [Rust](https://rustup.rs/) with the `wasm32-unknown-unknown`
target and [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/).

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Build the WASM bundle into src/wasm/pkg and the frontend
npm run build

# Run the engine's test suite
cd simulator && cargo test
```

## Cloudflare backend

The entire application is deployed as a single Cloudflare Worker:

- Static React app from `dist/` (SPA fallback enabled)
- `/auth/*` API routes powered by Hono
- D1 for relational data (users, sessions, circuits, blogs, analytics)
- R2 for avatars and circuit thumbnails
- Turnstile for bot protection on registration

### Wrangler configuration

- `wrangler.jsonc` — Worker, D1, R2, environment overrides
- `.dev.vars.example` — secrets needed for local development
- `src/worker/` — Worker entry point and API routes

### Auth API endpoints

- `POST /auth/register` — create account
- `POST /auth/login` — sign in
- `POST /auth/logout` — sign out
- `GET  /auth/me` — current user
- `GET  /auth/health` — health check
- `GET  /auth/turnstile-sitekey` — configured Turnstile site key
- `GET  /auth/check-username?username=` — check if a username is available
- `GET  /auth/stats` — public site statistics (users, circuits, shares)
- `GET  /auth/marketplace` — list publicly shared circuits (Community page)
- `GET  /auth/marketplace/:id` — view a shared circuit
- `GET  /auth/marketplace/:id/thumbnail` — shared circuit thumbnail

### Frontend auth gate

The React app now starts with an auth screen. After logging in or registering, it redirects to the circuit editor. A top header shows the logged-in user and a logout button.

Components:

- `src/context/AuthContext.tsx` — `useAuth` hook, session handling, login/register/logout
- `src/components/AuthPage.tsx` — login / register UI
- `src/App.tsx` — gates the circuit editor behind authentication
- `src/pages/CommunityPage.tsx` — browse and open publicly shared circuits
- `src/pages/CircuitsPage.tsx` — manage saved circuits and toggle sharing on the community

> **Legacy stack removed**: the old Docker/Fastify `auth-server` and `docker-compose.yml` setup have been deleted. All backend functionality now lives in `src/worker/` and is deployed as a single Cloudflare Worker.
>
> **Current limits**: circuit creation/saving is rate-limited per user; sharing is capped at 20 circuits per week; avatar changes are capped at 5 per hour; username changes are capped at 3 per hour. Set `DISABLE_RATE_LIMIT=true` to disable rate limiting.

### Local development

Terminal 1 — run the Worker and the built static app (uses local D1/R2):

```bash
npm install
npm run dev:worker
```

Terminal 2 — run the Vite dev server with HMR (proxies `/auth` to the Worker):

```bash
npm run dev
```

Then open http://localhost:5173.

### Deploy

Build the WASM bundle and React app, then deploy:

```bash
npm run build:worker

# Deploy to the dev environment
npm run deploy

# Deploy to production
npm run deploy:production
```

Dev deployments are triggered automatically on pushes to `dev` via `.github/workflows/deploy-dev.yml`. Production deployments are triggered on pushes to `main` via `.github/workflows/deploy-production.yml`.

### Database seeding

After applying migrations to a dev environment, seed it with sample data and dev accounts:

```bash
# Seed the local dev database
npm run db:seed:dev -- --local

# The --local variant seeds the top-level config's local D1 file (the one
# `wrangler dev --local` serves); do not combine it with --env.

# Seed the remote dev database
npm run db:seed:dev -- --env dev

# Dry-run the seed SQL without touching the database
npm run db:seed:dev -- --dry-run
```

Seeded dev accounts:

- `devadmin` / `devpassword` — admin user (blog editor).
- `devuser` / `devpassword` — regular user.

Admin privileges are controlled by the `users.is_admin` column, not by an env var. After applying migrations, grant admin rights with a D1 command:

```bash
# Local
wrangler d1 execute DB --local --command "UPDATE users SET is_admin = 1 WHERE username IN ('alex')"

# Dev
wrangler d1 execute DB --env dev --command "UPDATE users SET is_admin = 1 WHERE username IN ('alex')"

# Production
wrangler d1 execute DB --env production --command "UPDATE users SET is_admin = 1 WHERE username IN ('alex')"
```

### Deployment checks

Before deploying to a remote environment, verify that the configured D1 database and R2 buckets exist:

```bash
npm run check:deployment -- --env dev
```

### Test

```bash
npm run test              # unit tests (Vitest)
npm run test:worker       # build + worker integration tests
npm run test:e2e        # Playwright tests against a running Worker
npm run test:e2e:ui     # Playwright tests in UI mode
```

For e2e tests, start the Worker first with `npm run dev:worker` (or use `QUBITLAB_BASE_URL` to point to a deployed instance). Set `QUBITLAB_DEV_USERNAME` and `QUBITLAB_DEV_PASSWORD` to override the seeded dev account used by the authenticated tests.

### Secrets

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in the secrets.

For remote environments, set secrets with `wrangler secret put`:

```bash
wrangler secret put SESSION_SECRET --env dev
wrangler secret put TURNSTILE_SECRET_KEY --env dev
```
