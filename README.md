# Quantum-Dnd

A quantum-circuit designer frontend (React + Vite) with an in-browser simulation engine (Rust compiled to WASM, see `simulator/`) and a Fastify authentication backend backed by PostgreSQL.

## Simulation engine

The quantum statevector simulator is a Rust crate in `simulator/`, compiled to
WASM and executed in the browser — no simulation backend is required. The
data contract is documented in `docs/api.md`.

Prerequisites: [Rust](https://rustup.rs/) with the `wasm32-unknown-unknown`
target and [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/).

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Build the WASM bundle into src/wasm/pkg (once after cloning, and after
# every change to simulator/)
npm run build:wasm

# Run the engine's test suite
cd simulator && cargo test
```

## Authentication

The auth service lives in `auth-server/` and is orchestrated with Docker Compose.

### Quick start (Docker)

```bash
# 1. Copy the example environment and set a strong secret
cp .env.example .env

# 2. Start PostgreSQL and the Fastify auth API
docker compose up -d

# 3. Open the auth page
open http://localhost:3000/auth
```

Services:

- `postgres` — PostgreSQL 16, port `5432` (configurable via `.env`)
- `auth-server` — Fastify API on port `3000`

### Auth API endpoints

- `POST /auth/register` — create account
- `POST /auth/login` — sign in
- `POST /auth/logout` — sign out
- `GET  /auth/me` — current user
- `GET  /auth/health` — health check
- `GET  /auth` — static auth page (served by the Fastify backend)

### Frontend auth gate

The React app now starts with an auth screen. After logging in or registering, it redirects to the circuit editor. A top header shows the logged-in user and a logout button.

Components:

- `src/context/AuthContext.tsx` — `useAuth` hook, session handling, login/register/logout
- `src/components/AuthPage.tsx` — login / register UI
- `src/App.tsx` — gates the circuit editor behind authentication

### Local development

Terminal 1 — auth server & database:

```bash
docker compose up -d
# or
cd auth-server && npm install && npm run dev
```

Terminal 2 — Vite frontend:

```bash
npm install
npm run build:wasm   # first time only (and after simulator/ changes)
npm run dev
```

Then open http://localhost:5173.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
