import { Hono } from 'hono';
import type { HonoContext, HonoEnv } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { templateListParamSchema, createTemplateSchema, updateTemplateSchema } from '../schemas.js';
import { queryFirst, queryAll, runQuery, uniqueConstraintError } from '../db.js';
import { requireAdmin } from '../auth.js';
import { randomUUID } from '../crypto.js';

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

// GETs above stay public; requireAdmin sits between them and the mutations
// below because Hono middleware only applies to routes registered after it.

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
  values.push(new Date().toISOString());

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

export default templates;
