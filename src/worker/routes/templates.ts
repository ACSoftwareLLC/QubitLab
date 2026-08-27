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
