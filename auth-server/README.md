# Quantum-Dnd auth-server

Fastify-based authentication API backed by PostgreSQL.

## Endpoints

- `POST /auth/register` — create a new account
- `POST /auth/login` — sign in
- `POST /auth/logout` — sign out
- `GET  /auth/me` — current authenticated user
- `GET  /auth/health` — health check
- `GET  /auth` — user auth page (static HTML)

## Local development

Copy the root `.env.example` to `.env` and adjust values. Start PostgreSQL and the auth server:

```bash
npm install
npm run dev
```

The dev server uses `tsx` and runs migrations on startup.

## Docker

This service is built and started by the root `docker-compose.yml`.
