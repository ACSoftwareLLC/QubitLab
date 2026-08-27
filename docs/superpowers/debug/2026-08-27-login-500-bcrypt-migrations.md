# Login 500 Root-Cause & Fix — Evidence Log

**Date:** 2026-08-27
**Symptom:** Old accounts cannot log in on deployed dev (qubitlab-dev). Earlier same day: 401 "Invalid credentials"; after the bcrypt commit shipped, error became 500 "Internal server error". Locally: browser showed the Vite placeholder page "Run npm run dev:worker first, then npm run dev."

## Fix commits (already pushed)

| Commit | Fix |
| --- | --- |
| `95bad71` | `verifyPassword()` now verifies bcrypt (`$2a/$2b/$2y/$2x`) hashes via `bcryptjs` and flags them for PBKDF2 upgrade-on-login. Fixes the **401** phase of the bug. |
| `8712f19` | Deploy workflows now run `d1 migrations apply … --remote`. Fixes the **500** phase. |

## Root causes (two stacked)

### RC1 — bcrypt lockout (401 phase)

Legacy Fastify `auth-server` hashed passwords with bcrypt (`auth-server/src/routes/auth.ts:57` in commit `539857d`). The Worker's `verifyPassword()` accepted only its own
`pbkdf2-sha256$<iterations>$<salt>$<hash>` format and hard-rejected
`$2a`/`$2b` bcrypt hashes → permanent 401 for every pre-migration account.
Evidence: `git show 539857d:auth-server/src/routes/auth.ts | grep bcrypt` → `bcrypt.hash(password, 10)`.

### RC2 — CI migrations never reached Cloudflare (500 phase)

`d1 migrations apply DB --env dev` **defaults to the LOCAL sqlite D1** without `--remote`. In CI (no `--remote`), every deploy applied migrations to a throwaway `.wrangler/state/v3/d1` on the runner, then reported success. Result: remote dev D1 frozen at migration 0003 — **missing `is_admin` column** — while deployed code SELECTs it → D1 "no such column" → generic 500 (`src/worker/index.ts:28`).

CI log proof (run 32999550707):

```
🌀 Executing on local database DB (36d2d85a…) from .wrangler/state/v3/d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler dev command.
```
## Why the 500 only hit old accounts... actually everyone

`is_admin` is read for every login; before RC2's fix, **all** users 500'd remotely. The "old accounts" framing came from RC1's 401 masking RC2 — once bcrypt verification shipped, the schema bug surfaced as 500 for everyone. (Locally you saw the Vite placeholder because the stale workerd on :8787 was answering with old code.)

## Verification performed

1. **Unit level:** `src/worker/password.test.ts` — bcrypt round-trip test passes; suite 295/295 green.
2. **Local integration:** dev worker restarted (stale workerd squatted :8787 — killed PIDs 9877/9902), worker now serves current code on :8787.
   - `/auth/login` with seeded user + correct password → 200 Set-Cookie ✓ (fresh PBKDF2 path)
   - Reproduced user's exact 401 → confirmed it was the stale worker, not current code
3. **Remote schema:** `pragma_table_info('users')` now shows 11 columns incl. `is_admin`; `d1_migrations` lists 0001–0005 ✓ (applied manually via `npx wrangler d1 migrations apply DB --env dev --remote`).
4. **Remote end-to-end login:** **not verified from this machine** — the dev hostname sits behind Cloudflare Access (`alexm622.cloudflareaccess.com` 302). Human check required.

## Manual check for Alex (2 minutes)

1. Visit <https://qubitlab-dev.acomeau62203.workers.dev>, pass the Access gate, log in with your old account.
2. Expect: success + auto-upgrade of your hash to PBKDF2-600k. Any lingering failure, note the exact status/text (401 vs 403-banned vs 429).
3. Optional drift check: `npx wrangler d1 execute DB --env dev --remote --command "SELECT username, substr(password_hash,1,6) FROM users"`
   - Expect old accounts: `$2b$1…` (bcrypt) until they log in once, then `pbkdf2` afterwards.

## Follow-ups

- [ ] Alex: confirm login through the Access gate.
- [ ] Watch next push's "Apply D1 migrations" step: must say `Executing on remote database`.
- [ ] Consider a deploy-gate check (exit nonzero if remote `d1_migrations` behind local count) — candidate small task.
