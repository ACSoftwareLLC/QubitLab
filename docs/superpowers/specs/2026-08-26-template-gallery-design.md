# Template Gallery — Design

**Date:** 2026-08-26
**Status:** Approved design, pending implementation plan
**Related:** `planned-features.md` (#1), hardening roadmap (complete)

## Goal

Give QubitLab a curated library of ready-to-load quantum circuits — Grover,
teleportation, Deutsch–Jozsa, QFT, Bell states, etc. — each with a blog-style
explanation, so newcomers land on something they can run and learn from
instead of an empty canvas.

## Locked decisions

| Decision | Choice |
| ---------- | -------- |
| v1 scope | Gallery **plus** rich article per template |
| Curation | Admin-only writes, stored in D1, managed via admin UI (blogs model) |
| Placement | Dedicated `/templates` route + "Templates" entry in AppLayout nav |
| Article format | HTML via existing WysiwygEditor pipeline, sanitized with DOMPurify at render |

## Non-goals (v1)

- Guided/stepped lesson mode (follow-up phase on top of articles)
- Community submissions / approval queue
- Publish scheduling (`publish_at`) — templates are not time-sensitive
- Author attribution column (admins only)
- Comments, likes, remixing (separate planned feature)

## Data model

Migration `migrations/0006_circuit_templates.sql`:

```sql
CREATE TABLE circuit_templates (
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

CREATE INDEX idx_templates_published ON circuit_templates(published, sort_order);
```

Conventions follow the existing schema: `TEXT` UUIDs, JSON-in-`TEXT`
(`circuit` holds the same shape as `circuits.circuit`, validated by the
existing `circuitSchema` zod schema on every write), ISO-8601 UTC timestamps,
`INTEGER` booleans.

Category list is enforced by zod at the API layer and mirrored by the CHECK
constraint; adding a category later is one migration + one enum edit.

## API

New `src/worker/routes/templates.ts`, mounted at `/auth/templates` following
the blogs route pattern.

### Public

- `GET /auth/templates`
  Ordered by `sort_order`, then `created_at`. Hard `LIMIT` cap like other
  list endpoints. Returns published templates; **admins additionally see
  drafts** (flagged by `published: false`), following the blog
  draft-preview precedent (`isAdminRequest`).
- `GET /auth/templates/:slug`
  Full record including `circuit` (parsed JSON) and `articleHtml`.
  404 for unknown slugs and for drafts — except admins, who can preview
  their own drafts like on blog posts.

### Admin (all mutations behind `requireAdmin`)

- `POST /auth/templates` — create (published defaults false)
- `PATCH /auth/templates/:id` — partial update; recomputes `updated_at`
- `DELETE /auth/templates/:id`

Deletes are hard deletes (matching blog behavior); there is no soft-delete
state beyond the `published` draft flag.

### Validation

Zod schemas in `src/worker/schemas.ts`:

- `templateSchema` metadata: `slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–80),
  `title` (1–120), `description` (1–200), `category` enum,
  `difficulty` 1–3, `sort_order` int ≥ 0, `published` boolean
- `circuit`: reused `circuitSchema` verbatim (numBits ≤ 16, ops ≤ 1000 caps)
- `article_html`: string 1–100_000; sanitized client-side at render by
  DOMPurify (same trust model as blog content — server stores, never trusts)

Slug uniqueness violations map to 409 via the existing
`uniqueConstraintError` helper.

## Public frontend

- **`/templates`** — `TemplateGalleryPage.tsx`
  Card grid styled after the community page cards: title, category chip,
  difficulty badge (Beginner/Intermediate/Advanced), one-line description.
  Filter chips by category; difficulty shown but not filterable in v1.
- **`/templates/:slug`** — `TemplateDetailPage.tsx`
  Title, meta chips, article rendered through DOMPurify exactly like
  `BlogPostPage` sinks, plus an "Open in editor" primary button and a static
  circuit preview (reuse `CircuitThumbnail` rendering).
- **Nav:** "Templates" link added to AppLayout's public section.

## Editor integration

"Open in editor" stores the template's parsed circuit in
`sessionStorage` (`qubitlab.template-prefetch`) and navigates to `/editor`.
On mount, `EditorPage` checks for that key, loads gates/numBits into
`useCanvasState` through the existing deserialize path, clears the key, and
shows a small toast/banner: "Loaded template: {title}".

Nothing is persisted to the user's circuits unless they explicitly save.
Router state alone is insufficient (refresh loses it), hence sessionStorage.

## Admin UI

`/admin/templates` (inside the existing admin-gated route area):

- List view: all templates (published + draft) with publish toggle, edit,
  delete
- Form page: metadata fields, WysiwygEditor for the article, and an
  **"Import circuit JSON"** textarea — paste JSON captured from the editor
  (or anywhere) instead of hand-encoding gates. Validation errors surface
  inline before submit.

## Testing

- **Worker** (`src/worker/routes/templates.test.ts`, mirroring
  `blogs.test.ts`): public list excludes drafts; detail 404s on unknown/draft
  slug; anonymous mutation → 401; non-admin → 403; admin CRUD happy path;
  invalid circuit payload → 400; duplicate slug → 409; list LIMIT respected;
  malformed JSON body → 400.
- **Frontend unit:** detail page sanitizes `article_html` (script/handlers
  stripped) — extend the existing sanitizer test patterns.
- **E2E** (`e2e/csp.spec.ts` style): visit `/templates` → open a seeded
  template → click "Open in editor" → canvas shows expected gate count.
  Seed script gains two example templates (one Bell-state beginner, one
  Grover intermediate).

## Rollout notes

- Migration applies cleanly to local, dev, and production D1.
- Seed script (`scripts/seed-dev.ts`) inserts the two example templates so
  e2e and local dev have content immediately.
- No changes to existing tables or routes; purely additive.
