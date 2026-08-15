import { Hono } from 'hono';
import type { HonoEnv, HonoContext, PublicUserData } from '../types.js';
import { publicUser } from '../types.js';
import { jsonError, formatZodError } from '../errors.js';
import { createBlogSchema, updateBlogSchema } from '../schemas.js';
import { queryFirst, queryAll, runQuery, uniqueConstraintError } from '../db.js';
import { requireAdmin } from '../auth.js';
import { randomUUID } from '../crypto.js';
import { recordAnalyticsEvent } from '../analytics.js';

export type BlogRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  published: number;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  author_username: string | null;
  author_pfp_key: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_bio: string | null;
  author_is_admin: number | null;
};

export type BlogPostResponse = {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  published: boolean;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorProfile: PublicUserData | null;
};

const VISIBILITY_FILTER = `
  b.published = 1 AND (b.publish_at IS NULL OR b.publish_at <= datetime('now'))
`;

const SELECT_BLOGS = `
  b.id, b.slug, b.title, b.content, b.author, b.published, b.publish_at, b.created_at, b.updated_at,
  b.user_id, u.username AS author_username, u.pfp_key AS author_pfp_key,
  u.first_name AS author_first_name, u.last_name AS author_last_name, u.bio AS author_bio,
  u.is_admin AS author_is_admin
`;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

function buildAuthorProfile(row: BlogRow): PublicUserData | null {
  if (!row.user_id || !row.author_username) return null;
  return publicUser({
    id: row.user_id,
    username: row.author_username,
    pfp_key: row.author_pfp_key,
    is_admin: row.author_is_admin ?? 0,
    first_name: row.author_first_name,
    last_name: row.author_last_name,
    bio: row.author_bio,
  });
}

function buildBlogPost(row: BlogRow): BlogPostResponse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    author: row.author,
    published: row.published === 1,
    publishAt: row.publish_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorProfile: buildAuthorProfile(row),
  };
}

function isAdminRequest(c: HonoContext): boolean {
  const user = c.get('user');
  return user?.isAdmin ?? false;
}

const blogs = new Hono<HonoEnv>();

blogs.get('/', async (c) => {
  const admin = isAdminRequest(c);
  const rows = await queryAll<BlogRow>(
    c,
    `SELECT ${SELECT_BLOGS}
     FROM blogs b
     LEFT JOIN users u ON b.user_id = u.id
     ${admin ? '' : `WHERE ${VISIBILITY_FILTER}`}
     ORDER BY b.created_at DESC`
  );
  return c.json({ posts: rows.map((r) => buildBlogPost(r)) });
});

blogs.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const admin = isAdminRequest(c);
  const row = await queryFirst<BlogRow>(
    c,
    `SELECT ${SELECT_BLOGS}
     FROM blogs b
     LEFT JOIN users u ON b.user_id = u.id
     WHERE b.slug = ? ${admin ? '' : `AND ${VISIBILITY_FILTER}`}`,
    [slug]
  );
  if (!row) {
    return jsonError(c, 'Post not found', 404);
  }
  return c.json({ post: buildBlogPost(row) });
});

blogs.use(requireAdmin);

blogs.post('/', async (c) => {
  const body = await c.req.json();
  const result = createBlogSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const data = result.data;
  const normalizedSlug = slugify(data.slug);
  const user = c.get('user')!;
  const now = new Date().toISOString();

  const publishAt = data.publishAt ? new Date(data.publishAt).toISOString() : null;
  const published = publishAt ? true : data.published;

  try {
    const inserted = await queryFirst<{ id: string }>(
      c,
      `INSERT INTO blogs (id, slug, title, content, author, published, publish_at, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        randomUUID(),
        normalizedSlug,
        data.title,
        data.content,
        publicUser(user).displayName,
        published ? 1 : 0,
        publishAt ?? (published ? now : null),
        user.id,
        now,
        now,
      ]
    );

    const row = await queryFirst<BlogRow>(
      c,
      `SELECT ${SELECT_BLOGS}
       FROM blogs b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = ?`,
      [inserted!.id]
    );

    if (published) {
      c.executionCtx.waitUntil(
        recordAnalyticsEvent(c, {
          type: 'blog_published',
          path: `/blog/${normalizedSlug}`,
          userId: user.id,
          metadata: { postId: inserted!.id },
        }).catch(() => {})
      );
    }

    return c.json({ post: buildBlogPost(row!) }, 201);
  } catch (err) {
    if (uniqueConstraintError(err)) {
      return jsonError(c, 'A post with that slug already exists', 409);
    }
    throw err;
  }
});

blogs.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const result = updateBlogSchema.safeParse(body);
  if (!result.success) {
    return jsonError(c, formatZodError(result), 400);
  }

  const data = result.data;
  const existing = await queryFirst<{ id: string; slug: string; published: number; publish_at: string | null }>(
    c,
    `SELECT id, slug, published, publish_at FROM blogs WHERE slug = ?`,
    [slug]
  );
  if (!existing) {
    return jsonError(c, 'Post not found', 404);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }
  if (data.content !== undefined) {
    updates.push('content = ?');
    values.push(data.content);
  }
  if (data.published !== undefined || data.publishAt !== undefined) {
    let published = data.published !== undefined ? data.published : existing.published === 1;
    let publishAt = existing.publish_at;

    if (data.publishAt !== undefined) {
      publishAt = data.publishAt ? new Date(data.publishAt).toISOString() : null;
      published = publishAt ? true : (data.published ?? published);
    } else if (data.published === true && !existing.publish_at) {
      publishAt = new Date().toISOString();
    }

    updates.push('published = ?');
    values.push(published ? 1 : 0);
    updates.push('publish_at = ?');
    values.push(publishAt);
  }
  if (data.slug !== undefined) {
    updates.push('slug = ?');
    values.push(slugify(data.slug));
  }

  if (updates.length === 0) {
    return jsonError(c, 'No fields to update', 400);
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(now);
  values.push(existing.id);

  const updated = await queryFirst<{ id: string }>(
    c,
    `UPDATE blogs SET ${updates.join(', ')} WHERE id = ? RETURNING id`,
    values
  );

  const row = await queryFirst<BlogRow>(
    c,
    `SELECT ${SELECT_BLOGS}
     FROM blogs b
     LEFT JOIN users u ON b.user_id = u.id
     WHERE b.id = ?`,
    [updated!.id]
  );

  return c.json({ post: buildBlogPost(row!) });
});

blogs.delete('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const existing = await queryFirst<{ id: string }>(
    c,
    `SELECT id FROM blogs WHERE slug = ?`,
    [slug]
  );
  if (!existing) {
    return jsonError(c, 'Post not found', 404);
  }

  await runQuery(c, `DELETE FROM blogs WHERE id = ?`, [existing.id]);
  return c.json({ success: true });
});

export default blogs;
