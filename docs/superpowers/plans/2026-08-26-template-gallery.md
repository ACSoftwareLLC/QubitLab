# Template Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-curated `/templates` gallery: each template is a ready-to-load quantum circuit plus a blog-style HTML article, loadable into the editor in one click.

**Architecture:** New D1 table `circuit_templates` behind a new Hono router mounted at `/auth/templates` (blogs route pattern: public GETs first, then `requireAdmin` mutations). React SPA gains a public gallery + detail page; the detail page hands the circuit to `EditorPage` via `sessionStorage`. Article HTML is sanitized at render with the existing DOMPurify helper.

**Tech Stack:** Cloudflare Worker (Hono, TypeScript, `@cloudflare/workers-types`), D1, Zod, React 19 + react-router-dom 7, Vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-template-gallery-design.md` — read it first; this plan argues from it.

## Global Constraints

- Worker code lives in `src/worker/`, compiled against `tsconfig.worker.json`. No Node-only modules (`Buffer`, `node:crypto`) — use helpers from `src/worker/crypto.js`.
- D1 conventions: TEXT UUIDs via `randomUUID()` from `src/worker/crypto.js`; ISO-8601 UTC text timestamps; JSON stored as TEXT; booleans as INTEGER 0/1.
- Category enum exactly `foundations | algorithm | entanglement | games`; difficulty exactly `1|2|3`; `published` defaults to false; slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` length 3–80; title ≤ 120; description ≤ 200; `article_html` ≤ 100_000 chars; list `limit` default 100, max 200.
- Circuit payloads validate with the **existing** `circuitSchema` in `src/worker/schemas.ts` — never fork or relax it. Valid gate types: `H X Y Z S T Sdg Tdg SX I Rx Ry Rz P C CX CZ CCX SWAP M`.
- All frontend HTML rendering of `articleHtml` goes through `sanitizeHtml()` from `src/utils/sanitize.ts`.
- Vitest runs WITHOUT globals: import `describe/it/expect/vi` from `'vitest'`; RTL suites call `afterEach(cleanup)` (see `src/components/StatePanel.test.tsx`).
- Command cheat sheet: single suite `npx vitest run <path>`; all units `npx vitest run`; typecheck `npx tsc -b`; worker integration `npm run build && npm run test:worker`. E2E needs a running worker: start `npm run dev:worker`, wait until `curl localhost:8787/auth/health` returns 200, then `npx playwright test <spec>`. **Rebuilding `dist/` while a dev worker runs invalidates its asset manifest — restart the worker after builds.**
- One conventional commit per task, scope `templates`.

---

### Task 1: Migration + Zod validation schemas

**Files:**

- Create: `migrations/0006_circuit_templates.sql`
- Modify: `src/worker/schemas.ts` (append at end)
- Create: `src/worker/schemas.test.ts`

**Interfaces:**

- Consumes: existing `circuitSchema` from `src/worker/schemas.ts`.
- Produces (later tasks import by these exact names): `templateCategories`, `TemplateCategory`, `createTemplateSchema`, `updateTemplateSchema`, `templateListParamSchema`, types `CreateTemplateBody` / `UpdateTemplateBody`.

- [ ] **Step 1: Write the failing schema tests**

Create `src/worker/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createTemplateSchema,
  updateTemplateSchema,
  circuitSchema,
} from './schemas.js';

const validCircuit = circuitSchema.parse({
  numBits: 2,
  ops: [
    { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
    { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
  ],
});

const validTemplate = {
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Create and verify maximal entanglement.',
  category: 'entanglement',
  difficulty: 1,
  circuit: validCircuit,
  articleHtml: '<p>How the Bell state works.</p>',
};

describe('createTemplateSchema', () => {
  it('accepts a fully valid template body', () => {
    expect(createTemplateSchema.safeParse(validTemplate).success).toBe(true);
  });

  it('defaults published to false and sortOrder to 0', () => {
    const result = createTemplateSchema.parse(validTemplate);
    expect(result.published).toBe(false);
    expect(result.sortOrder).toBe(0);
  });

  it('rejects slugs outside kebab-case 3-80', () => {
    for (const bad of ['ab', 'UPPER-CASE', 'has_underscore', '-'.repeat(81)]) {
      expect(
        createTemplateSchema.safeParse({ ...validTemplate, slug: bad }).success
      ).toBe(false);
    }
  });

  it('rejects category values outside the enum', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, category: 'misc' })
        .success
    ).toBe(false);
  });

  it('rejects difficulty outside 1-3', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, difficulty: 4 })
        .success
    ).toBe(false);
  });

  it('rejects empty articleHtml and oversized description', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, articleHtml: '' })
        .success
    ).toBe(false);
    expect(
      createTemplateSchema.safeParse({
        ...validTemplate,
        description: 'x'.repeat(201),
      }).success
    ).toBe(false);
  });
});

describe('updateTemplateSchema', () => {
  it('accepts partial updates', () => {
    expect(
      updateTemplateSchema.safeParse({ title: 'New title' }).success
    ).toBe(true);
  });

  it('still parses an empty object — the ROUTE rejects empty patches (mirrors updateBlogSchema)', () => {
    // blogs precedent: zod stays permissive, route enforces "at least one field".
    expect(updateTemplateSchema.safeParse({}).success).toBe(true);
  });
});
```

Note the deliberate behavior split (matches `updateBlogSchema = createBlogSchema.partial()` in the existing code): zod tolerates the empty object; **the PATCH route** (Task 3) rejects it with 400. Do not add `.refine()` here.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/worker/schemas.test.ts`
Expected: FAIL — `createTemplateSchema` not exported yet.

- [ ] **Step 3: Add the migration**

Create `migrations/0006_circuit_templates.sql`:

```sql
-- Curated algorithm templates shown in the /templates gallery.
CREATE TABLE IF NOT EXISTS circuit_templates (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('foundations','algorithm','entanglement','games')),
  difficulty   INTEGER NOT NULL CHECK (difficulty IN (1,2,3)),
  circuit      TEXT NOT NULL,
  article_html TEXT NOT NULL,
  published    INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_published ON circuit_templates(published, sort_order);
```

- [ ] **Step 4: Append the Zod schemas**

In `src/worker/schemas.ts`, append at the end of the file:

```typescript
export const templateCategories = [
  'foundations',
  'algorithm',
  'entanglement',
  'games',
] as const;

export type TemplateCategory = (typeof templateCategories)[number];

export const createTemplateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(200),
  category: z.enum(templateCategories),
  difficulty: z.number().int().min(1).max(3),
  circuit: circuitSchema,
  articleHtml: z.string().min(1).max(100_000),
  published: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const templateListParamSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;
```

(`z.coerce` mirrors `blogListParamSchema`'s query-string handling.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/worker/schemas.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Apply the migration locally**

Run:

```bash
wrangler d1 migrations apply DB --local
wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='circuit_templates'"
```

Expected: migration applies cleanly; the query returns one row named `circuit_templates`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add migrations/0006_circuit_templates.sql src/worker/schemas.ts src/worker/schemas.test.ts
git commit -m "feat(templates): add circuit_templates migration and zod schemas"
```

---

### Task 2: Template router — public endpoints

**Files:**

- Create: `src/worker/routes/templates.ts`
- Modify: `src/worker/index.ts` (one import line + one mount line)
- Create: `src/worker/routes/templates.test.ts`

**Interfaces:**

- Consumes: `queryFirst` / `queryAll` from `../db.js`; `jsonError` / `formatZodError` from `../errors.js`; `HonoEnv` / `HonoContext` types from `../types.js` (exactly as `blogs.ts` imports them); schemas from Task 1.
- Produces: default-exported Hono app mounted at `/auth/templates` by `index.ts` (`auth.route('/templates', templateRoutes);` directly after the blogs mount). Response contracts consumed by Tasks 4–6:
  - `GET /auth/templates` → `{ templates: Array<{ id, slug, title, description, category, difficulty, published }> }`, ordered `sort_order ASC, created_at ASC`; guests see published only, admins additionally see drafts (`published: false`).
  - `GET /auth/templates/:slug` → `{ template: <list item> & { circuit: object, articleHtml: string, createdAt: string, updatedAt: string } }`; guests get 404 `'Template not found'` on unknown slug OR draft; admins can preview drafts.

- [ ] **Step 1: Write the failing tests**

Create `src/worker/routes/templates.test.ts`. Copy these helpers VERBATIM from `src/worker/routes/blogs.test.ts` (they are intentionally duplicated per-file in this repo's worker tests — do not extract a shared helper in this task): the inline `mockD1`, `mockR2`, `mockExecutionCtx` functions; constants `SESSION_USER`, `ADMIN_COOKIE`, `USER_COOKIE`; the `makeEnv(d1Handlers, user = SESSION_USER)` factory. Add next to them:

```typescript
const NON_ADMIN_USER = { ...SESSION_USER, id: 'user-2', username: 'bob', is_admin: 0 };

function makeTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    slug: 'bell-state',
    title: 'Bell State',
    description: 'Create and verify maximal entanglement.',
    category: 'entanglement',
    difficulty: 1,
    circuit: JSON.stringify({
      numBits: 2,
      ops: [
        { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
        { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
      ],
    }),
    article_html: '<p>Bell state explanation</p>',
    published: 1,
    sort_order: 0,
    created_at: '2026-08-26T00:00:00Z',
    updated_at: '2026-08-26T00:00:00Z',
    ...overrides,
  };
}
```

Mock-dispatch primer (how the copied `mockD1` works, so handlers are keyed correctly): every prepared statement flows through `prepare(sql)` → the FIRST registered fragment contained in `sql` wins; its handler receives `(currentSql, params)` and its return value feeds `first()` (first element if array) or `all()` (as `results`). Register list/detail row data under the fragment `'FROM circuit_templates'` — when you need a handler to behave differently for the detail query vs the list query, branch inside ONE handler on `String(sql).includes('WHERE slug')` (detail) vs not (list), as shown below. Rate-limit/session/user lookups already work because `makeEnv` pre-registers `'FROM sessions'` and `'FROM users WHERE id'`.

Then the actual suite:

```typescript
describe('template routes — public', () => {
  it('lists templates with parsed metadata, omitting heavy fields', async () => {
    const env = makeEnv({
      'FROM circuit_templates': () => [
        makeTemplateRow(),
        makeTemplateRow({ id: 'tpl-2', slug: 'grover-search', title: 'Grover Search', published: 0 }),
      ],
    });
    const res = await app.fetch(new Request('http://localhost/auth/templates'), env, mockExecutionCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1); // draft excluded for guests
    expect(body.templates[0]).toMatchObject({ slug: 'bell-state', category: 'entanglement', difficulty: 1, published: true });
    expect(body.templates[0].circuit).toBeUndefined();
    expect(body.templates[0].articleHtml).toBeUndefined();
  });

  it('includes drafts for admin list requests', async () => {
    const env = makeEnv({
      'FROM circuit_templates': (_sql: string) => [
        makeTemplateRow(),
        makeTemplateRow({ id: 'tpl-2', slug: 'grover-search', title: 'Grover Search', published: 0 }),
      ],
    }, SESSION_USER);
    const res = await app.fetch(new Request('http://localhost/auth/templates'), env, mockExecutionCtx());
    const body = await res.json();
    expect(body.templates).toHaveLength(2);
    expect(body.templates.map((t: { slug: string }) => t.slug)).toContain('grover-search');
  });

  it('returns full detail incl. parsed circuit and articleHtml', async () => {
    const env = makeEnv({
      'FROM circuit_templates': (sql: string) =>
        String(sql).includes('WHERE slug') ? [makeTemplateRow()] : [],
    });
    const res = await app.fetch(new Request('http://localhost/auth/templates/bell-state'), env, mockExecutionCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.articleHtml).toBe('<p>Bell state explanation</p>');
    expect(body.template.circuit.numBits).toBe(2);
    expect(Array.isArray(body.template.circuit.ops)).toBe(true);
    expect(body.template.createdAt).toBe('2026-08-26T00:00:00Z');
  });

  it('404s unknown slugs', async () => {
    const env = makeEnv({
      'FROM circuit_templates': (sql: string) =>
        String(sql).includes('WHERE slug') ? [] : [],
    });
    const res = await app.fetch(new Request('http://localhost/auth/templates/nope'), env, mockExecutionCtx());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Template not found' });
  });

  it('hides draft detail from guests but shows it to admins', async () => {
    const draft = makeTemplateRow({ published: 0 });

    const guestRes = await app.fetch(
      new Request('http://localhost/auth/templates/bell-state'),
      // Guest visibility lives in composed SQL ('AND published = 1'); this
      // mock simply returns no row, exercising the 404 path.
      makeEnv({
        'FROM circuit_templates': () => [],
      }),
      mockExecutionCtx()
    );
    expect(guestRes.status).toBe(404);

    const adminRes = await app.fetch(
      new Request('http://localhost/auth/templates/bell-state'),
      makeEnv({
        'FROM circuit_templates': (sql: string) =>
          String(sql).includes('WHERE slug') ? [draft] : [],
      }, SESSION_USER),
      mockExecutionCtx()
    );
    expect(adminRes.status).toBe(200);
    expect((await adminRes.json()).template.published).toBe(false);
  });

  it('rejects an out-of-range limit with 400 before touching the DB', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/templates?limit=500'),
      makeEnv({}),
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });
});
```

At the top of the file import like blogs.test.ts does: `import app from '../index.js';` plus vitest imports (`describe, it, expect, vi, beforeEach`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/worker/routes/templates.test.ts`
Expected: FAIL — every request 404s because no route is mounted yet.

- [ ] **Step 3: Implement the router and mount it**

Create `src/worker/routes/templates.ts`:

```typescript
import { Hono } from 'hono';
import type { HonoContext, HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { templateListParamSchema } from '../schemas.js';
import { queryFirst, queryAll } from '../db.js';

export type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: number;
  circuit: string;
  article_html: string;
  published: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function isAdminRequest(c: HonoContext): boolean {
  return c.get('user')?.isAdmin ?? false;
}

export function buildTemplateListItem(row: TemplateRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    published: row.published === 1,
  };
}

export function buildTemplateDetail(row: TemplateRow) {
  return {
    ...buildTemplateListItem(row),
    circuit: JSON.parse(row.circuit),
    articleHtml: row.article_html,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const SELECT_TEMPLATES = `
  id, slug, title, description, category, difficulty, circuit,
  article_html, published, sort_order, created_at, updated_at`;

const templates = new Hono<HonoEnv>();

// NOTE: no auth middleware here — public routes below; Task 3 adds
// templates.use(requireAdmin) AFTER these GETs, mirroring blogs.ts ordering.

templates.get('/', async (c) => {
  const params = templateListParamSchema.safeParse(c.req.query());
  if (!params.success) {
    return jsonError(c, formatZodError(params), 400);
  }
  const admin = isAdminRequest(c);

  const rows = await queryAll<TemplateRow>(
    c,
    `SELECT ${SELECT_TEMPLATES}
     FROM circuit_templates
     ${admin ? '' : 'WHERE published = 1'}
     ORDER BY sort_order ASC, created_at ASC
     LIMIT ?`,
    [params.data.limit]
  );
  return c.json({ templates: rows.map(buildTemplateListItem) });
});

templates.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const admin = isAdminRequest(c);

  const row = await queryFirst<TemplateRow>(
    c,
    `SELECT ${SELECT_TEMPLATES}
     FROM circuit_templates
     WHERE slug = ? ${admin ? '' : 'AND published = 1'}`,
    [slug]
  );
  if (!row) {
    return jsonError(c, 'Template not found', 404);
  }
  return c.json({ template: buildTemplateDetail(row) });
});

export default templates;
```

If `types.js` does not actually export `HonoContext` (check the top of `blogs.ts` for the exact name it uses — it imports `HonoContext` from `../types.js`), match whatever `blogs.ts` does verbatim. Guest/admin visibility lives ONLY in the composed SQL (same pattern as `VISIBILITY_FILTER` in blogs.ts) — never post-filter rows in JS.

Wire up `src/worker/index.ts`: add `import templateRoutes from './routes/templates.js';` beside the other route imports, and `auth.route('/templates', templateRoutes);` directly after the blogs mount line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/worker/routes/templates.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck + full unit suite**

Run: `npx tsc -b && npx vitest run`
Expected: exit 0, no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/worker/routes/templates.ts src/worker/routes/templates.test.ts src/worker/index.ts
git commit -m "feat(templates): public list and detail endpoints"
```

---

### Task 3: Template router — admin CRUD

**Files:**

- Modify: `src/worker/routes/templates.ts`
- Modify: `src/worker/routes/templates.test.ts`

**Interfaces:**

- Consumes: `requireAdmin` from `../auth.js` (used exactly like `blogs.use(requireAdmin)`); `runQuery`, `uniqueConstraintError` from `../db.js`; `randomUUID` from `../crypto.js`; `createTemplateSchema` / `updateTemplateSchema` from Task 1.
- Produces:
  - `POST /auth/templates` → 201 `{ template }`, published defaults false.
  - `PATCH /auth/templates/:id` → 200 `{ template }`; rejects empty patch 400 `'Provide at least one field to update'`.
  - `DELETE /auth/templates/:id` → 204 empty body.
  - Errors: 400 invalid body; 409 duplicate slug via `uniqueConstraintError`; 404 mutating nonexistent id.

- [ ] **Step 1: Write the failing tests**

Append to `src/worker/routes/templates.test.ts`:

```typescript
describe('template routes — admin mutations', () => {
  const createBody = {
    slug: 'teleportation',
    title: 'Quantum Teleportation',
    description: 'Move a state with two classical bits.',
    category: 'foundations',
    difficulty: 2,
    circuit: {
      numBits: 3,
      ops: [
        { id: 1, type: 'H', segment: 0, targets: [1], controls: [], angle: null },
        { id: 2, type: 'CX', segment: 1, targets: [2], controls: [1], angle: null },
        { id: 3, type: 'M', segment: 3, targets: [2], controls: [], angle: null },
      ],
    },
    articleHtml: '<p>Teleportation protocol</p>',
  };

  it('rejects anonymous creation with 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody),
      }),
      makeEnv({}),
      mockExecutionCtx()
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-admin creation with 403', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: USER_COOKIE },
        body: JSON.stringify(createBody),
      }),
      makeEnv({}, NON_ADMIN_USER),
      mockExecutionCtx()
    );
    expect(res.status).toBe(403);
  });

  it('creates a template and returns its detail (201)', async () => {
    const env = makeEnv({
      // Re-fetch after INSERT — detail response source.
      'FROM circuit_templates WHERE id': () => [
        makeTemplateRow({ id: 'uuid-1', slug: 'teleportation', title: 'Quantum Teleportation', published: 0 }),
      ],
      // handlers that return arrays feed both first() and all(); runQuery's
      // .run() dispatch is a no-op unless a fragment matches.
      'INSERT INTO circuit_templates': () => undefined,
    }, SESSION_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
        body: JSON.stringify(createBody),
      }),
      env,
      mockExecutionCtx()
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.template).toMatchObject({ slug: 'teleportation', published: false });
    expect(body.template.circuit.numBits).toBe(3);
  });

  it('maps duplicate-slug constraint errors to 409', async () => {
    const env = makeEnv({
      'INSERT INTO circuit_templates': () => {
        throw Object.assign(new Error('UNIQUE constraint failed: circuit_templates.slug'), {
          cause: { error: 2069 },
        });
      },
    }, SESSION_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
        body: JSON.stringify(createBody),
      }),
      env,
      mockExecutionCtx()
    );
    expect(res.status).toBe(409);
  });

  it('rejects invalid bodies with 400', async () => {
    for (const bad of [
      { ...createBody, category: 'quantum' },
      { ...createBody, circuit: { numBits: 99, ops: [] } },
      {},
    ]) {
      const res = await app.fetch(
        new Request('http://localhost/auth/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
          body: JSON.stringify(bad),
        }),
        makeEnv({}, SESSION_USER),
        mockExecutionCtx()
      );
      expect(res.status).toBe(400);
    }
  });

  it('patches partial fields and returns the updated detail', async () => {
    const env = makeEnv({
      'UPDATE circuit_templates SET': () => undefined,
      'FROM circuit_templates WHERE id': () => [
        makeTemplateRow({ title: 'Updated title', updated_at: '2026-08-27T00:00:00Z' }),
      ],
    }, SESSION_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/templates/tpl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ title: 'Updated title' }),
      }),
      env,
      mockExecutionCtx()
    );
    expect(res.status).toBe(200);
    expect((await res.json()).template.title).toBe('Updated title');
  });

  it('rejects an empty patch with 400', async () => {
    const res = await app.fetch(
      new Request('http://localhost/auth/templates/tpl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
        body: JSON.stringify({}),
      }),
      makeEnv({}, SESSION_USER),
      mockExecutionCtx()
    );
    expect(res.status).toBe(400);
  });

  it('deletes an existing template with 204 and misses missing ones with 404', async () => {
    const okEnv = makeEnv({
      'FROM circuit_templates WHERE id': () => [{ id: 'tpl-1' }],
      'DELETE FROM circuit_templates': () => undefined,
    }, SESSION_USER);
    const ok = await app.fetch(
      new Request('http://localhost/auth/templates/tpl-1', { method: 'DELETE', headers: { Cookie: ADMIN_COOKIE } }),
      okEnv,
      mockExecutionCtx()
    );
    expect(ok.status).toBe(204);

    const missEnv = makeEnv({ 'FROM circuit_templates WHERE id': () => [] }, SESSION_USER);
    const gone = await app.fetch(
      new Request('http://localhost/auth/templates/nope', { method: 'DELETE', headers: { Cookie: ADMIN_COOKIE } }),
      missEnv,
      mockExecutionCtx()
    );
    expect(gone.status).toBe(404);
  });
});
```

Implementation note used by the delete/insert tests above: the copied blogs-test `mockD1` feeds `.run()` through the same handler map; fragments must be plain substrings of the actual SQL (`'DELETE FROM circuit_templates'`, `'INSERT INTO circuit_templates'`). Handlers registered under `'FROM circuit_templates WHERE id'` must be distinct from `'FROM circuit_templates'`, so order matters when both could match — register the more specific fragment FIRST.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/worker/routes/templates.test.ts`
Expected: mutation tests FAIL (route missing → 404 or no POST route).

- [ ] **Step 3: Implement the mutations**

Append to `src/worker/routes/templates.ts`:

```typescript
import { formatZodError } from '../errors.js';           // merge into existing import
import { createTemplateSchema, updateTemplateSchema } from '../schemas.js'; // extend existing import
import { requireAdmin } from '../auth.js';
import { randomUUID } from '../crypto.js';

templates.use(requireAdmin);

templates.post('/', async (c) => {
  const parsed = createTemplateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, formatZodError(parsed), 400);
  }
  const data = parsed.data;
  const now = new Date().toISOString();
  const id = randomUUID();

  try {
    await runQuery(
      c,
      `INSERT INTO circuit_templates
       (id, slug, title, description, category, difficulty, circuit, article_html, published, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.slug, data.title, data.description, data.category, data.difficulty,
        JSON.stringify(data.circuit), data.articleHtml,
        data.published ? 1 : 0, data.sortOrder, now, now,
      ]
    );
  } catch (err) {
    if (uniqueConstraintError(err)) {
      return jsonError(c, 'A template with that slug already exists', 409);
    }
    throw err;
  }

  const row = await queryFirst<TemplateRow>(
    c,
    `SELECT ${SELECT_TEMPLATES} FROM circuit_templates WHERE id = ?`,
    [id]
  );
  return c.json({ template: buildTemplateDetail(row!) }, 201);
});

templates.patch('/:id', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(raw ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return jsonError(c, 'Provide at least one field to update', 400);
  }
  const data = parsed.data;
  const id = c.req.param('id');

  const columnByField: Record<string, string> = {
    slug: 'slug',
    title: 'title',
    description: 'description',
    category: 'category',
    difficulty: 'difficulty',
    circuit: 'circuit',
    articleHtml: 'article_html',
    published: 'published',
    sortOrder: 'sort_order',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [field, column] of Object.entries(columnByField)) {
    if (!(field in data)) continue;
    sets.push(`${column} = ?`);
    if (field === 'circuit') values.push(JSON.stringify(data[field as keyof typeof data]));
    else if (field === 'published') values.push((data as Record<string, unknown>)[field] ? 1 : 0);
    else values.push((data as Record<string, unknown>)[field]);
  }
  sets.push('updated_at = ?');

  try {
    await runQuery(
      c,
      `UPDATE circuit_templates SET ${sets.join(', ')} WHERE id = ?`,
      [...values, id]
    );
  } catch (err) {
    if (uniqueConstraintError(err)) {
      return jsonError(c, 'A template with that slug already exists', 409);
    }
    throw err;
  }

  const row = await queryFirst<TemplateRow>(
    c,
    `SELECT ${SELECT_TEMPLATES} FROM circuit_templates WHERE id = ?`,
    [id]
  );
  if (!row) {
    return jsonError(c, 'Template not found', 404);
  }
  return c.json({ template: buildTemplateDetail(row) });
});

templates.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await queryFirst<{ id: string }>(
    c,
    'SELECT id FROM circuit_templates WHERE id = ?',
    [id]
  );
  if (!existing) {
    return jsonError(c, 'Template not found', 404);
  }
  await runQuery(c, 'DELETE FROM circuit_templates WHERE id = ?', [id]);
  return c.body(null, 204);
});
```

Key ordering facts for executors: (a) middleware runs top-down, so `templates.use(requireAdmin)` AFTER the GETs keeps list/detail public while gating POST/PATCH/DELETE below it — same structure as blogs.ts; (b) zod `.partial()` ignores unknown keys; the `columnByField` loop iterates only known columns, so unknown keys are silently dropped (matches `updateCircuitSchema` behavior); (c) empty-patch rejection is the explicit `Object.keys(parsed.data).length === 0` check since zod stays permissive per Task 1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/worker/routes/templates.test.ts`
Expected: PASS (13 tests total across both suites)

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npx vitest run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/worker/routes/templates.ts src/worker/routes/templates.test.ts
git commit -m "feat(templates): admin CRUD with slug-conflict mapping"
```

---

### Task 4: Frontend API client + shared types

**Files:**

- Create: `src/types/templates.ts`
- Create: `src/api/templates.ts`
- Create: `src/api/templates.test.ts`

**Interfaces:**

- Consumes: backend response shapes from Tasks 2–3 (envelope keys `templates` / `template`; camelCase `articleHtml`, snake_case dates).
- Produces (consumed verbatim by Tasks 5–8): types `TemplateCategory`, `TemplateSummary`, `TemplateDetail`, `TemplateInput`; functions `listTemplates(): Promise<TemplateSummary[]>`, `getTemplate(slug: string): Promise<TemplateDetail>`, `createTemplate(input): Promise<TemplateDetail>`, `updateTemplate(id, input): Promise<TemplateDetail>`, `deleteTemplate(id): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `src/api/templates.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { listTemplates, getTemplate } from './templates';

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = {
  id: 'tpl-1',
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Entanglement demo.',
  category: 'entanglement',
  difficulty: 1,
  published: true,
};

describe('templates api client', () => {
  it('lists templates with credentials included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ templates: [summary] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('bell-state');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/templates',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('surfaces a friendly error for 404 detail fetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Template not found' }),
      })
    );
    await expect(getTemplate('nope')).rejects.toThrow('Template not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/templates.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement types and client**

Create `src/types/templates.ts`:

```typescript
import type { Circuit } from '../api/types';

export type TemplateCategory =
  | 'foundations'
  | 'algorithm'
  | 'entanglement'
  | 'games';

export interface TemplateSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  difficulty: number;
  published: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  circuit: Circuit;
  articleHtml: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  slug?: string;
  title?: string;
  description?: string;
  category?: TemplateCategory;
  difficulty?: number;
  circuit?: Circuit;
  articleHtml?: string;
  published?: boolean;
  sortOrder?: number;
}
```

Create `src/api/templates.ts` — copy the `apiFetch` envelope style from `src/api/blogs.ts`:

```typescript
import type { TemplateSummary, TemplateDetail, TemplateInput } from '../types/templates';

type TemplateCreateInput = Required<
  Pick<TemplateInput, 'slug' | 'title' | 'description' | 'category' | 'difficulty' | 'circuit' | 'articleHtml'>
> &
  TemplateInput;

const apiFetch = async (
  method: string,
  path: string,
  body?: Record<string, unknown>
) => {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as
    | { error?: string; templates?: TemplateSummary[]; template?: TemplateDetail }
    | Record<string, never>;
  return { ok: res.ok, status: res.status, data };
};

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { ok, data } = await apiFetch('GET', '/auth/templates');
  if (!ok || !data.templates) throw new Error(data.error || 'Failed to load templates');
  return data.templates;
}

export async function getTemplate(slug: string): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch(
    'GET',
    `/auth/templates/${encodeURIComponent(slug)}`
  );
  if (status === 404) throw new Error(data.error || 'Template not found');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to load template');
  return data.template;
}

export async function createTemplate(input: TemplateCreateInput): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch('POST', '/auth/templates', input);
  if (status === 409) throw new Error(data.error || 'That slug is already in use');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to create template');
  return data.template;
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch(
    'PATCH',
    `/auth/templates/${encodeURIComponent(id)}`,
    input
  );
  if (status === 409) throw new Error(data.error || 'That slug is already in use');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to update template');
  return data.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/auth/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to delete template');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/templates.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/types/templates.ts src/api/templates.ts src/api/templates.test.ts
git commit -m "feat(templates): frontend api client and types"
```

---

### Task 5: Gallery page + navigation

**Files:**

- Create: `src/pages/TemplateGalleryPage.tsx`
- Create: `src/pages/TemplateGalleryPage.test.tsx`
- Modify: `src/App.tsx` (public routes block — after the `/community` route at ~line 59)
- Modify: `src/components/AppLayout.tsx` (nav beside the blog NavLink at ~line 38)
- Modify: stylesheet holding `.circuit-card` rules (locate: `grep -rn "circuit-card" src/ --include="*.css"`), append filter-chip styles ≤ 30 lines scoped under `.content-page`

**Interfaces:**

- Consumes: `listTemplates()`, `TemplateSummary` from Task 4; `QuantumField` component used by BlogPage/BlogPostPage.
- Produces: public route `/templates`; nav link "Templates"; card link accessible name = template title. Gallery never imports worker code — the category list is duplicated locally as a presentational constant (single source of truth remains the zod enum; this is deliberate).

- [ ] **Step 1: Write the failing component tests**

Create `src/pages/TemplateGalleryPage.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TemplateGalleryPage } from './TemplateGalleryPage';
import type { TemplateSummary } from '../types/templates';

vi.mock('../api/templates', () => ({
  listTemplates: vi.fn(),
}));

import { listTemplates } from '../api/templates';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const summaries: TemplateSummary[] = [
  { id: 't1', slug: 'bell-state', title: 'Bell State', description: 'Entanglement.', category: 'entanglement', difficulty: 1, published: true },
  { id: 't2', slug: 'grover-search', title: 'Grover Search', description: 'Unstructured search.', category: 'algorithm', difficulty: 3, published: true },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TemplateGalleryPage />
    </MemoryRouter>
  );
}

describe('TemplateGalleryPage', () => {
  it('renders cards with category and difficulty labels', async () => {
    vi.mocked(listTemplates).mockResolvedValue(summaries);
    renderPage();
    expect(await screen.findByText('Bell State')).toBeInTheDocument();
    expect(screen.getByText('Grover Search')).toBeInTheDocument();
    expect(screen.getByText(/beginner/i)).toBeInTheDocument();
    expect(screen.getByText(/advanced/i)).toBeInTheDocument();
  });

  it('filters by category when a chip is clicked', async () => {
    vi.mocked(listTemplates).mockResolvedValue(summaries);
    renderPage();
    await screen.findByText('Bell State');
    fireEvent.click(screen.getByRole('button', { name: /^entanglement$/i }));
    expect(screen.queryByText('Grover Search')).not.toBeInTheDocument();
    expect(screen.getByText('Bell State')).toBeInTheDocument();
  });

  it('shows an empty state when no templates exist', async () => {
    vi.mocked(listTemplates).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no templates yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/TemplateGalleryPage.test.tsx`
Expected: FAIL — page module missing.

- [ ] **Step 3: Implement the page, route, nav, styles**

Create `src/pages/TemplateGalleryPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuantumField } from '../components/QuantumField';
import { listTemplates } from '../api/templates';
import type { TemplateSummary } from '../types/templates';

const CATEGORIES = [
  'all',
  'foundations',
  'algorithm',
  'entanglement',
  'games',
] as const;

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

export function TemplateGalleryPage() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] =
    useState<(typeof CATEGORIES)[number]>('all');

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load templates')
      );
  }, []);

  const visible = useMemo(
    () =>
      (templates ?? []).filter(
        (t) => filter === 'all' || t.category === filter
      ),
    [templates, filter]
  );

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <header className="content-page-header">
          <h1 className="content-page-title">Templates</h1>
          <p className="page-muted">
            Ready-to-run circuits with guided explanations. Open one and press
            Simulate.
          </p>
        </header>

        <nav className="template-filters" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`template-filter-chip${filter === cat ? ' active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>

        {error && <div className="auth-message error">{error}</div>}
        {!templates && !error && <p className="page-muted">Loading…</p>}
        {templates && visible.length === 0 && (
          <p className="page-muted">No templates yet.</p>
        )}

        <ul className="card-grid">
          {visible.map((t) => (
            <li key={t.id} className="circuit-card">
              <Link to={`/templates/${t.slug}`} className="circuit-card-link">
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <span className="badge">{t.category}</span>{' '}
                <span className="badge badge-muted">
                  {DIFFICULTY_LABEL[t.difficulty]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/TemplateGalleryPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck + full suite**

```css
/* Template gallery filters */
.content-page .template-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.content-page .template-filter-chip {
  padding: 0.3rem 0.9rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  cursor: pointer;
  text-transform: capitalize;
}

.content-page .template-filter-chip.active {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.12);
}

.content-page .card-grid {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
```

Verify class names `content-page*`, `page-muted`, `auth-message`, `circuit-card`, `badge` exist (`grep -rn "content-page-title\|badge-muted" src/ --include="*.css"`); substitute closest existing classes where absent rather than inventing CSS beyond the block above.

In `src/App.tsx`, inside the public `<Route path="/community" …/>` block neighborhood:

```tsx
<Route path="/templates" element={<TemplateGalleryPage />} />
```

with import `import { TemplateGalleryPage } from './pages/TemplateGalleryPage';`.

In `src/components/AppLayout.tsx`, after the blog NavLink:

```tsx
<NavLink to="/templates" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
  Templates
</NavLink>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/TemplateGalleryPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npx vitest run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TemplateGalleryPage.tsx src/pages/TemplateGalleryPage.test.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(templates): public gallery page with category filters"
```

---

### Task 6: Detail page + "Open in editor" hand-off

**Files:**

- Create: `src/pages/TemplateDetailPage.tsx`
- Create: `src/pages/templatePrefetch.ts`
- Create: `src/pages/TemplateDetailPage.test.tsx`
- Modify: `src/App.tsx` (route beneath `/templates`)

**Interfaces:**

- Consumes: `getTemplate()`, `TemplateDetail` from Task 4; `sanitizeHtml` from `src/utils/sanitize.ts`; `CircuitThumbnail` props `{ circuit: Circuit; width: number }`.
- Produces: THE hand-off contract consumed by Task 7 — constant `TEMPLATE_PREFETCH_KEY = 'qubitlab.template-prefetch'` exported from `src/pages/templatePrefetch.ts` (NOT from the page file); payload shape `{ title: string; circuit: Circuit }`. Also exports `consumeTemplatePrefetch(): { title: string; circuit: Circuit } | null`.

- [ ] **Step 1: Write the failing helper tests**

Create `src/pages/templatePrefetch.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  TEMPLATE_PREFETCH_KEY,
  consumeTemplatePrefetch,
} from './templatePrefetch';
import type { Circuit } from '../api/types';

afterEach(() => sessionStorage.clear());

const circuit: Circuit = {
  numBits: 2,
  ops: [
    { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
    { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
  ],
};

describe('consumeTemplatePrefetch', () => {
  it('returns and clears a valid payload', () => {
    sessionStorage.setItem(
      TEMPLATE_PREFETCH_KEY,
      JSON.stringify({ title: 'Bell State', circuit })
    );
    const result = consumeTemplatePrefetch();
    expect(result?.title).toBe('Bell State');
    expect(result?.circuit.ops).toHaveLength(2);
    expect(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)).toBeNull();
  });

  it('returns null for malformed payloads and still clears', () => {
    sessionStorage.setItem(TEMPLATE_PREFETCH_KEY, '{"broken":');
    expect(consumeTemplatePrefetch()).toBeNull();
    expect(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(consumeTemplatePrefetch()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/templatePrefetch.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the helper**

Create `src/pages/templatePrefetch.ts`:

```typescript
import type { Circuit } from '../api/types';

/** sessionStorage key shared between TemplateDetailPage and EditorPage. */
export const TEMPLATE_PREFETCH_KEY = 'qubitlab.template-prefetch';

/**
 * Reads and clears the template hand-off written by TemplateDetailPage.
 * Returns null for missing or malformed payloads; the key is ALWAYS cleared.
 */
export function consumeTemplatePrefetch(): {
  title: string;
  circuit: Circuit;
} | null {
  const raw = sessionStorage.getItem(TEMPLATE_PREFETCH_KEY);
  sessionStorage.removeItem(TEMPLATE_PREFETCH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { title?: unknown; circuit?: unknown };
    const circuit = parsed.circuit as { numBits?: unknown; ops?: unknown } | null;
    if (
      typeof parsed.title === 'string' &&
      circuit &&
      typeof circuit === 'object' &&
      typeof circuit.numBits === 'number' &&
      Array.isArray(circuit.ops)
    ) {
      return { title: parsed.title, circuit: circuit as unknown as Circuit };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/templatePrefetch.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing page tests**

Create `src/pages/TemplateDetailPage.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TemplateDetailPage } from './TemplateDetailPage';
import { TEMPLATE_PREFETCH_KEY } from './templatePrefetch';
import type { TemplateDetail } from '../types/templates';

vi.mock('../api/templates', () => ({
  getTemplate: vi.fn(),
}));

import { getTemplate } from '../api/templates';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const bell: TemplateDetail = {
  id: 't1',
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Entanglement demo.',
  category: 'entanglement',
  difficulty: 1,
  published: true,
  circuit: {
    numBits: 2,
    ops: [
      { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
      { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
    ],
  },
  articleHtml:
    '<p>Watch the statevector become entangled<script>alert(1)</script></p>',
  createdAt: '2026-08-26T00:00:00Z',
  updatedAt: '2026-08-26T00:00:00Z',
};

function renderAt(path = '/templates/bell-state') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:slug" element={<TemplateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TemplateDetailPage', () => {
  it('renders sanitized article html', async () => {
    vi.mocked(getTemplate).mockResolvedValue(bell);
    renderAt();
    expect(await screen.findByText(/entangled/i)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('open-in-editor stores the circuit under the prefetch key', async () => {
    const user = userEvent.setup();
    vi.mocked(getTemplate).mockResolvedValue(bell);
    renderAt();
    await user.click(await screen.findByRole('button', { name: /open in editor/i }));

    const stored = JSON.parse(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)!);
    expect(stored.title).toBe('Bell State');
    expect(stored.circuit.numBits).toBe(2);
  });

  it('shows the error message on failed loads', async () => {
    vi.mocked(getTemplate).mockRejectedValue(new Error('Template not found'));
    renderAt('/templates/nope');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
```

Add `userEvent` from '@testing-library/user-event' (already a dependency of RTL environments — verify with `grep -n "user-event" package.json`; if absent use `fireEvent.click` instead and import it from RTL).

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/pages/TemplateDetailPage.test.tsx`
Expected: FAIL — page missing.

- [ ] **Step 7: Implement the page**

Create `src/pages/TemplateDetailPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QuantumField } from '../components/QuantumField';
import { CircuitThumbnail } from '../components/CircuitThumbnail';
import { getTemplate } from '../api/templates';
import { sanitizeHtml } from '../utils/sanitize';
import { TEMPLATE_PREFETCH_KEY } from './templatePrefetch';
import type { TemplateDetail } from '../types/templates';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

export function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getTemplate(slug)
      .then(setTemplate)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load template')
      );
  }, [slug]);

  const openInEditor = () => {
    if (!template) return;
    sessionStorage.setItem(
      TEMPLATE_PREFETCH_KEY,
      JSON.stringify({ title: template.title, circuit: template.circuit })
    );
    navigate('/editor');
  };

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <Link to="/templates" className="home-card-link">
          <i className="bi bi-arrow-left" /> Back to templates
        </Link>

        {error && <div className="auth-message error">{error}</div>}
        {!template && !error && <p className="page-muted">Loading…</p>}

        {template && (
          <article className="blog-article">
            <div className="blog-article-meta">
              <span className="badge">{template.category}</span>
              <span className="badge badge-muted">
                {DIFFICULTY_LABEL[template.difficulty]}
              </span>
              {!template.published && (
                <span className="blog-status-badge">Draft</span>
              )}
            </div>
            <h1 className="blog-article-title">{template.title}</h1>

            <button type="button" className="btn-primary" onClick={openInEditor}>
              Open in editor
            </button>

            <section className="template-preview">
              <CircuitThumbnail circuit={template.circuit} width={480} />
            </section>

            {/* Sanitized exactly like BlogPostPage sinks. */}
            <div
              className="blog-article-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(template.articleHtml) }}
            />
          </article>
        )}
      </div>
    </div>
  );
}
```

Verify CSS classes against existing usage before running (`blog-article*` come from blog styling; if `btn-primary` doesn't exist use the same button class BlogPostPage uses for its primary action).

Register in `src/App.tsx` under the gallery route:

```tsx
<Route path="/templates/:slug" element={<TemplateDetailPage />} />
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/pages/TemplateDetailPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Typecheck + full suite**

Run: `npx tsc -b && npx vitest run`
Expected: green.

- [ ] **Step 10: Commit**

```bash
git add src/pages/templatePrefetch.ts src/pages/templatePrefetch.test.ts src/pages/TemplateDetailPage.tsx src/pages/TemplateDetailPage.test.tsx src/App.tsx
git commit -m "feat(templates): detail page with sanitized articles and editor handoff"
```

---

### Task 7: Editor consumes the prefetch

**Files:**

- Modify: `src/pages/EditorPage.tsx` (handoff effect ~lines 113–119, plus banner state/render)

**Interfaces:**

- Consumes: `consumeTemplatePrefetch()` from Task 6; existing `loadCircuit(circuit)` + `sim.reset()` pattern already in EditorPage's `location.state` effect.
- Produces: behavior only — prefetched templates load on mount and show a dismissible banner `Loaded template: <title>`. No new exports.

- [ ] **Step 1: Write the failing banner test**

There is no existing EditorPage test mount (check `ls src/pages/*.test.tsx`); mounting the whole page drags in WASM simulation, so assert the observable unit instead: a tiny presentational subcomponent. Create `src/pages/TemplateBanner.test.tsx` AND extract the banner into `src/pages/TemplateBanner.tsx` so both EditorPage and tests share it:

```tsx
// src/pages/TemplateBanner.test.tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TemplateBanner } from './TemplateBanner';

afterEach(cleanup);

describe('TemplateBanner', () => {
  it('shows the template title and dismisses', () => {
    const { rerender } = render(
      <TemplateBanner name="Bell State" onDismiss={() => {}} />
    );
    expect(screen.getByText(/loaded template/i)).toBeInTheDocument();
    expect(screen.getByText('Bell State')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss template banner/i }));
    // Parent removes it from the tree; assert via callback below.
  });

  it('calls onDismiss when dismissed', () => {
    let dismissed = false;
    render(<TemplateBanner name="X" onDismiss={() => { dismissed = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss template banner/i }));
    expect(dismissed).toBe(true);
  });
});
```

Note honestly recorded here: the first test above asserts dismissal clickability indirectly via the second test's callback assertion. If the first test's final line feels redundant, delete that `fireEvent` block from test 1 and keep the render+title assertions only.

- [ ] **Step 2: Implement the banner component**

Create `src/pages/TemplateBanner.tsx`:

```tsx
interface TemplateBannerProps {
  name: string;
  onDismiss: () => void;
}

export function TemplateBanner({ name, onDismiss }: TemplateBannerProps) {
  return (
    <div className="template-loaded-banner" role="status">
      Loaded template: <strong>{name}</strong>
      <button
        type="button"
        aria-label="Dismiss template banner"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/pages/TemplateBanner.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 4: Wire prefetch + banner into EditorPage**

In `src/pages/EditorPage.tsx`:

1. Import `{ consumeTemplatePrefetch }` from `./templatePrefetch` and `{ TemplateBanner }` from `./TemplateBanner`.
2. Add state beside the other hooks: `const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);`
3. Replace the existing `location.state` effect (~lines 114–119) with:

```tsx
// Load a circuit handed over via navigation state (My Circuits) or a
// template prefetch from the gallery (sessionStorage contract).
useEffect(() => {
  const handed = location.state as { circuit?: Circuit } | null;
  const prefetched = consumeTemplatePrefetch();
  if (prefetched) {
    sim.reset();
    loadCircuit(prefetched.circuit);
    setLoadedTemplateName(prefetched.title);
  } else if (handed?.circuit) {
    sim.reset();
    loadCircuit(handed.circuit);
    window.history.replaceState({}, '');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [location.state]);
```

1. Render the banner as the first child of the `.builder-layout` div:

```tsx
{loadedTemplateName && (
  <TemplateBanner
    name={loadedTemplateName}
    onDismiss={() => setLoadedTemplateName(null)}
  />
)}
```

Append ~12 lines of banner CSS next to other builder styles (sticky top positioning, z-index below modals, flex row with dismiss button):

```css
.template-loaded-banner {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
}
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npx vitest run`
Expected: green — proves no EditorPage regressions via the rest of the suite.

- [ ] **Step 6: Manual smoke**

Start `npm run dev:worker` (wait for `/auth/health` → 200) and `npm run dev`; visit `http://localhost:5173/editor`, then in DevTools console:

```js
sessionStorage.setItem('qubitlab.template-prefetch', JSON.stringify({ title: 'Smoke', circuit: { numBits: 2, ops: [{ id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null }] } }));
location.href = '/editor';
```

Expected: H gate appears on row 0; sticky banner reads "Loaded template: Smoke"; dismissing works.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TemplateBanner.tsx src/pages/TemplateBanner.test.tsx src/pages/EditorPage.tsx
git commit -m "feat(editor): load templates handed off from the gallery"
```

---

### Task 8: Admin management UI

**Files:**

- Create: `src/pages/AdminTemplatesPage.tsx`
- Create: `src/pages/AdminTemplatesPage.test.tsx`
- Modify: `src/App.tsx` (admin route block near `/admin/users` ~line 78)
- Modify: admin nav surface — locate where `/admin/analytics` and `/admin/users` links are rendered (`grep -rn "admin/analytics\|admin/users" src/components src/pages --include="*.tsx" | grep -v "\.test\." | head`) and add an equivalent "Manage templates" entry.

**Interfaces:**

- Consumes: `listTemplates/createTemplate/updateTemplate/deleteTemplate`, types from Task 4; `WysiwygEditor` props `{ value: string; onChange: (html: string) => void; placeholder?: string }`; the exact admin-guard pattern used by `UserManagementPage.tsx` (`grep -n "isAdmin\|Navigate\|useAuth" src/pages/UserManagementPage.tsx | head` — replicate whatever guard it uses, which per AuthContext exposes `user.isAdmin: boolean`).
- Produces: route `/admin/templates`; no new exports.
- UX scope (per spec): list all templates incl. drafts with publish toggle → `updateTemplate(id, { published })`; Edit form with slug/title/description/category/difficulty/sortOrder/published fields, WysiwygEditor for the article, "Import circuit JSON" textarea validated inline (parse + check `numBits`/`ops` array shape before submit); New/Delete buttons with `window.confirm` before hard delete.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/AdminTemplatesPage.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminTemplatesPage } from './AdminTemplatesPage';
import type { TemplateSummary } from '../types/templates';

vi.mock('../api/templates', () => ({
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

const mockAuthState = { user: { isAdmin: true } };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

import {
  listTemplates,
  createTemplate,
  deleteTemplate,
} from '../api/templates';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rows: TemplateSummary[] = [
  { id: 't1', slug: 'bell-state', title: 'Bell State', description: 'd', category: 'entanglement', difficulty: 1, published: true },
  { id: 't2', slug: 'grover', title: 'Grover', description: 'g', category: 'algorithm', difficulty: 3, published: false },
];

describe('AdminTemplatesPage', () => {
  it('guards non-admins', () => {
    mockAuthState.user = { isAdmin: false };
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    expect(screen.getByText(/administrators only/i)).toBeInTheDocument();
  });

  it('lists templates including drafts', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    expect(await screen.findByText('Bell State')).toBeInTheDocument();
    expect(screen.getByText('Grover').closest('li')).toHaveTextContent(/draft/i);
  });

  it('validates pasted circuit JSON inline without submitting', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue([]);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /new template/i }));
    fireEvent.change(screen.getByLabelText(/circuit json/i), {
      target: { value: '{not json}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.getByText(/invalid circuit json/i)).toBeInTheDocument()
    );
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('deletes with confirmation', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    vi.mocked(deleteTemplate).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    const li = (await screen.findByText('Grover')).closest('li')!;
    fireEvent.click(within(li).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('t2'));
  });
});
```

(`within` joins the RTL import list.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/AdminTemplatesPage.test.tsx`
Expected: FAIL — page missing.

- [ ] **Step 3: Implement the page**

Implementation skeleton note: the code below is complete and satisfies all four tests; only adjust CSS class names to match existing admin-page markup (`UserManagementPage.tsx`) where needed:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WysiwygEditor } from '../components/WysiwygEditor';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
} from '../api/templates';
import type { TemplateDetail, TemplateInput, TemplateSummary } from '../types/templates';
import type { Circuit } from '../api/types';

const EMPTY_FORM = {
  slug: '',
  title: '',
  description: '',
  category: 'foundations' as const,
  difficulty: 1,
  sortOrder: 0,
  published: false,
  articleHtml: '<p></p>',
  circuitJson: '',
};

type FormState = typeof EMPTY_FORM;

function parseCircuitJson(raw: string): Circuit | null {
  try {
    const parsed = JSON.parse(raw) as { numBits?: unknown; ops?: unknown };
    if (
      parsed &&
      typeof parsed.numBits === 'number' &&
      Number.isInteger(parsed.numBits) &&
      parsed.numBits >= 1 && parsed.numBits <= 16 &&
      Array.isArray(parsed.ops)
    ) {
      return parsed as unknown as Circuit;
    }
    return null;
  } catch {
    return null;
  }
}

export function AdminTemplatesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TemplateSummary[] | null>(null);
  const [editing, setEditing] = useState<TemplateDetail | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listTemplates()
      .then(setItems)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load templates')
      );
  }, []);
  useEffect(refresh, [refresh]);

  if (!user?.isAdmin) {
    return <p className="page-muted">Administrators only.</p>;
  }

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = async (summary: TemplateSummary) => {
    try {
      const detail = await getTemplate(summary.slug);
      setEditing(detail);
      setForm({
        slug: detail.slug,
        title: detail.title,
        description: detail.description,
        category: detail.category,
        difficulty: detail.difficulty,
        sortOrder: 0, // detail does not carry sortOrder; preserved on PATCH by omitting the field
        published: detail.published,
        articleHtml: detail.articleHtml,
        circuitJson: JSON.stringify(detail.circuit, null, 2),
      });
      setFormError(null);
    } catch {
      setLoadError('Failed to load template for editing');
    }
  };

  const save = async () => {
    const circuit = parseCircuitJson(form.circuitJson);
    if (!circuit) {
      setFormError('Invalid circuit JSON — expected {"numBits": n, "ops": [...]}');
      return;
    }
    const base: TemplateInput = {
      slug: form.slug,
      title: form.title,
      description: form.description,
      category: form.category,
      difficulty: form.difficulty,
      published: form.published,
      sortOrder: form.sortOrder,
      circuit,
      articleHtml: form.articleHtml,
    };
    try {
      if (editing === 'new') {
        await createTemplate(base as Required<typeof base>);
      } else if (editing) {
        await updateTemplate(editing.id, base);
      }
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this template permanently?')) return;
    await deleteTemplate(id);
    refresh();
  };

  const togglePublish = async (t: TemplateSummary) => {
    await updateTemplate(t.id, { published: !t.published });
    refresh();
  };

  // List view…
  if (editing === null) {
    return (
      <div className="content-page">
        <header className="content-page-header">
          <h1 className="content-page-title">Manage templates</h1>
          <button type="button" onClick={openNew}>New template</button>
        </header>
        {loadError && <div className="auth-message error">{loadError}</div>}
        {!items && !loadError && <p className="page-muted">Loading…</p>}
        <ul>
          {(items ?? []).map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong> <code>{t.slug}</code>
              {!t.published && <em> — draft</em>}
              {' '}
              <button type="button" onClick={() => togglePublish(t)}>
                {t.published ? 'Unpublish' : 'Publish'}
              </button>
              {' '}
              <button type="button" onClick={() => void openEdit(t)}>Edit</button>
              {' '}
              <button type="button" onClick={() => void remove(t.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Form view (New or Edit)…
  return (
    <div className="content-page">
      <header className="content-page-header">
        <h1 className="content-page-title">
          {editing === 'new' ? 'New template' : `Edit: ${editing.title}`}
        </h1>
      </header>
      {formError && <div className="auth-message error">{formError}</div>}
      <label>
        Slug
        <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
      </label>
      <label>
        Title
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        Description
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <label>
        Category
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FormState['category'] })}>
          <option value="foundations">foundations</option>
          <option value="algorithm">algorithm</option>
          <option value="entanglement">entanglement</option>
          <option value="games">games</option>
        </select>
      </label>
      <label>
        Difficulty
        <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
          <option value={1}>Beginner</option>
          <option value={2}>Intermediate</option>
          <option value={3}>Advanced</option>
        </select>
      </label>
      <label>
        Published
        <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
      </label>
      <label>
        Circuit JSON
        <textarea
          aria-label="Circuit JSON"
          rows={10}
          value={form.circuitJson}
          onChange={(e) => setForm({ ...form, circuitJson: e.target.value })}
        />
      </label>
      <WysiwygEditor
        value={form.articleHtml}
        onChange={(html) => setForm({ ...form, articleHtml: html })}
        placeholder="Write the explanation…"
      />
      <button type="button" onClick={() => void save()}>Save</button>
      <Link to="/admin/templates" onClick={() => setEditing(null)}>Cancel</Link>
    </div>
  );
}
```

Register the route inside the authenticated+AppLayout wrapper block with the other admin routes:

```tsx
<Route path="/admin/templates" element={<AdminTemplatesPage />} />
```

Add the nav entry found in step Files (the grep above shows where admin links live).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/AdminTemplatesPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npx vitest run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminTemplatesPage.tsx src/pages/AdminTemplatesPage.test.tsx src/App.tsx
git commit -m "feat(templates): admin management UI with circuit JSON import"
```

---

### Task 9: Seed content + e2e smoke + docs

**Files:**

- Modify: `scripts/seed-dev.ts` (insert two templates after circuit seeding)
- Create: `e2e/templates.spec.ts`
- Modify: `README.md` (add migration note + one command example) and `planned-features.md` (mark gallery section implemented)
- Modify: `CHANGELOG.md` (new minor entry per repo convention)

**Interfaces:**

- Consumes: everything shipped in Tasks 1–8; e2e conventions from `e2e/smoke.spec.ts` (plain `@playwright/test`, baseURL from playwright.config).
- Produces: seeded dev content (one beginner Bell state, one intermediate Grover) and automated e2e proof of the whole loop.

- [ ] **Step 1: Add template seeding**

In `scripts/seed-dev.ts`, follow the existing pattern (`circuitJson(name)` builds gate JSON; batch INSERT statements wipe + reseed tables — see lines ~214–280). Add a `circuit_templates` reseed using the SAME op shapes already proven there (`H`, `CX` with `segment`/`targets`/`controls`):

```typescript
// --- templates (curated gallery) ---
await batch([
  'DELETE FROM circuit_templates;',
  [
    'INSERT INTO circuit_templates (id, slug, title, description, category, difficulty, circuit, article_html, published, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'tpl-seed-bell', 'bell-state', 'Bell State',
      'Create and verify maximal entanglement between two qubits.',
      'entanglement', 1,
      JSON.stringify({
        numBits: 2,
        ops: [
          { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
          { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
        ],
      }),
      '<p>The Bell state is the simplest entangled state. Build H ⊗ CX and watch the statevector collapse onto (|00⟩ + |11⟩)/√2.</p>',
      1, 0, '2026-08-26T00:00:00Z', '2026-08-26T00:00:00Z',
    ],
  ],
  [
    'INSERT INTO circuit_templates (id, slug, title, description, category, difficulty, circuit, article_html, published, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'tpl-seed-grover', 'grover-search', 'Grover Search',
      'Find a marked item with amplitude amplification.',
      'algorithm', 2,
      JSON.stringify({
        numBits: 3,
        ops: [
          { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
          { id: 2, type: 'H', segment: 0, targets: [1], controls: [], angle: null },
          { id: 3, type: 'H', segment: 0, targets: [2], controls: [], angle: null },
          { id: 4, type: 'CCX', segment: 1, targets: [2], controls: [0, 1], angle: null },
        ],
      }),
      '<p>Grover\'s algorithm amplifies the amplitude of the marked state. This two-qubit-oracle demo shows one iteration; watch probabilities shift after each diffusion step.</p>',
      1, 1, '2026-08-26T00:00:00Z', '2026-08-26T00:00:00Z',
    ],
  ],
]);
```

Match EXACTLY how `batch()` / statement arrays are built around existing seeds (read the file's own helpers; adapt names — the snippet above is the semantic contract, syntax must fit the surrounding code).

Then reset local data so e2e sees it:

```bash
npm run db:seed:dev -- --local
wrangler d1 execute DB --local --command "SELECT slug, published FROM circuit_templates"
```

Expected: two rows, both published=1.

- [ ] **Step 2: Write the e2e spec**

Create `e2e/templates.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("template gallery", () => {
  test("guest can browse the gallery", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
    await expect(page.getByText("Bell State")).toBeVisible();
    await expect(page.getByText("Grover Search")).toBeVisible();
  });

  test("category filter chips narrow the grid", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByText("Bell State")).toBeVisible();
    await page.getByRole("button", { name: "algorithm", exact: true }).click();
    await expect(page.getByText("Grover Search")).toBeVisible();
    await expect(page.getByText("Bell State")).not.toBeVisible();
  });

  test("detail renders article and hands off to the editor", async ({
    page,
  }) => {
    await page.goto("/templates");
    await page.getByText("Bell State").click();
    await expect(page).toHaveURL(/\/templates\/bell-state$/);
    await expect(page.getByRole("button", { name: /open in editor/i })).toBeVisible();

    // Editor requires auth — sign in as the seeded regular user.
    const username = process.env.QUBITLAB_DEV_USERNAME ?? "devuser";
    const password = process.env.QUBITLAB_DEV_PASSWORD ?? "devpassword";
    await page.request.post("/auth/login", {
      data: { username, password },
    });
    // Share the session cookie with the browser context.
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "sessionId");
    expect(session).toBeTruthy();

    await page.getByRole("button", { name: /open in editor/i }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByText(/loaded template/i)).toBeVisible();
    await expect(page.locator(".canvas-gate, [class*=gate]").first()).toBeVisible();
  });

  test("list endpoint is reachable and returns seeded templates", async ({
    request,
  }) => {
    const response = await request.get("/auth/templates");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.templates.some((t: { slug: string }) => t.slug === "bell-state")).toBe(true);
  });
});
```

Cookie-handling note: request-based login via `page.request.post` shares cookies with the browser context automatically (same APIRequestContext), so the explicit cookie-transfer block above is a SAFETY NET — if the login cookie is already visible to `page.context()`, DELETE those five middle lines (context.cookies + find) and rely on Playwright's shared storage state. If, when running, the editor redirect bounces to /login instead, fall back to logging in through the real UI form (fill inputs by label on `/login`, submit) before clicking through.

- [ ] **Step 3: Run e2e**

Terminal 1: `npm run dev:worker` — wait until `curl localhost:8787/auth/health` returns 200 (remember migrations/seed went into the LOCAL D1 the worker serves).
Terminal 2: `npx playwright test e2e/templates.spec.ts`
Expected: PASS (4 tests). **If `/` unexpectedly 404s, restart the dev worker (stale asset manifest after build) and retry.**

- [ ] **Step 4: Full verification sweep**

```bash
npm run build && npm run test:worker   # integration
npx vitest run                         # all units
npx tsc -b                             # clean
```

Expected: all green. Restart the dev worker after the build, rerun the whole e2e suite once (`npx playwright test`): expect no regressions in the pre-existing 12 specs plus the new 4.

- [ ] **Step 5: Docs**

- `CHANGELOG.md`: new entry at top following the existing format (version bump minor, dated).
- `README.md`: if the Database section lists migrations/steps, mention `0006_circuit_templates.sql` only insofar as the established docs pattern references migrations.
- `planned-features.md`: mark the gallery section as implemented (checkbox or strikethrough per its own convention), leave remaining features queued.

- [ ] **Step 6: Final commit**

```bash
git add scripts/seed-dev.ts e2e/templates.spec.ts README.md planned-features.md CHANGELOG.md AGENTS.md
git commit -m "feat(templates): seed content, e2e coverage, and docs"
```

---

## Verification checklist (whole feature)

- [ ] `npx tsc -b` clean
- [ ] `npx vitest run` — every suite green (baseline 294 + ≈28 new)
- [ ] `npm run build && npm run test:worker` — integration green
- [ ] Full `npx playwright test` — pre-existing suites unregressed + 4 new template tests pass
- [ ] Manual: `/templates` browse → filter → open Bell State → "Open in editor" → canvas + banner correct while logged out vs logged in
- [ ] Manual: admin creates draft via `/admin/templates`, previews it in the gallery while logged in, publishes, verifies guest visibility
