import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdmin } from '../hooks/requireAdmin.js';
import { config } from '../config.js';
import { displayNameFor, pfpUrlFor } from '../utils/user.js';

const createSchema = z.object({
  slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  published: z.boolean().optional().default(true),
  publishAt: z.string().datetime().optional().nullable(),
});

const updateSchema = createSchema.partial();

function isAdminRequest(req: FastifyRequest): boolean {
  return req.user !== null && config.admins.includes(req.user.username);
}

const PUBLIC_VISIBILITY_FILTER = `
  b.published = TRUE AND (b.publish_at IS NULL OR b.publish_at <= NOW())
`;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

interface BlogRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  published: boolean;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  author_username: string | null;
  author_pfp_key: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
}

interface BlogAuthorProfile {
  username: string;
  displayName: string;
  pfpUrl: string | null;
  isAdmin: boolean;
}

interface BlogPostResponse {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  published: boolean;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  authorProfile: BlogAuthorProfile | null;
}

function buildAuthorProfile(row: BlogRow): BlogAuthorProfile | null {
  if (!row.user_id || !row.author_username) return null;
  return {
    username: row.author_username,
    displayName:
      row.author === row.author_username
        ? displayNameFor({
            username: row.author_username,
            first_name: row.author_first_name,
            last_name: row.author_last_name,
          })
        : row.author,
    pfpUrl: pfpUrlFor(row.user_id, row.author_pfp_key),
    isAdmin: config.admins.includes(row.author_username),
  };
}

function buildBlogPost(row: BlogRow): BlogPostResponse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    author: row.author,
    published: row.published,
    publish_at: row.publish_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    authorProfile: buildAuthorProfile(row),
  };
}

const SELECT_PUBLIC_BLOGS = `
  b.id, b.slug, b.title, b.content, b.author, b.published, b.publish_at, b.created_at, b.updated_at,
  b.user_id, u.username AS author_username, u.pfp_key AS author_pfp_key,
  u.first_name AS author_first_name, u.last_name AS author_last_name
`;

const blogRoutes: FastifyPluginAsync = async (app) => {
  app.get('/blogs', async (req) => {
    const admin = isAdminRequest(req);
    const { rows } = await pool.query(
      `SELECT ${SELECT_PUBLIC_BLOGS}
       FROM blogs b
       LEFT JOIN users u ON b.user_id = u.id
       ${admin ? '' : `WHERE ${PUBLIC_VISIBILITY_FILTER}`}
       ORDER BY b.created_at DESC`
    );
    return { posts: (rows as BlogRow[]).map(buildBlogPost) };
  });

  app.get('/blogs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const admin = isAdminRequest(req);
    const { rows } = await pool.query(
      `SELECT ${SELECT_PUBLIC_BLOGS}
       FROM blogs b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.slug = $1 ${admin ? '' : `AND ${PUBLIC_VISIBILITY_FILTER}`}`,
      [slug]
    );
    if (rows.length === 0) {
      reply.code(404);
      return { error: 'Post not found' };
    }
    return { post: buildBlogPost(rows[0] as BlogRow) };
  });

  app.post('/blogs', { preHandler: requireAdmin }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const normalizedSlug = slugify(body.slug);
    const user = req.user!;
    const author = displayNameFor({
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
    });
    const publishAt = body.publishAt ? new Date(body.publishAt).toISOString() : null;
    const published = publishAt ? true : (body.published ?? false);
    try {
      const {
        rows: [{ id: postId }],
      } = await pool.query(
        `INSERT INTO blogs(slug, title, content, author, published, publish_at, user_id)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          normalizedSlug,
          body.title,
          body.content,
          author,
          published,
          publishAt ?? (published ? new Date().toISOString() : null),
          user.id,
        ]
      );

      const {
        rows: [post],
      } = await pool.query(
        `SELECT ${SELECT_PUBLIC_BLOGS}
         FROM blogs b
         LEFT JOIN users u ON b.user_id = u.id
         WHERE b.id = $1`,
        [postId]
      );

      reply.code(201);
      return { post: buildBlogPost(post as BlogRow) };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        reply.code(409);
        return { error: 'A post with that slug already exists' };
      }
      throw err;
    }
  });

  app.patch('/blogs/:slug', { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = updateSchema.parse(req.body);
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(body.title);
    }
    if (body.content !== undefined) {
      updates.push(`content = $${idx++}`);
      values.push(body.content);
    }
    if (body.published !== undefined || body.publishAt !== undefined) {
      let published = body.published;
      let publishAt: string | null = null;

      if (body.publishAt !== undefined) {
        publishAt = body.publishAt ? new Date(body.publishAt).toISOString() : null;
        published = publishAt ? true : (published ?? false);
      } else if (published) {
        publishAt = new Date().toISOString();
      }

      updates.push(`published = $${idx++}`);
      values.push(published ?? false);
      updates.push(`publish_at = $${idx++}`);
      values.push(publishAt);
    }
    if (body.slug !== undefined) {
      updates.push(`slug = $${idx++}`);
      values.push(slugify(body.slug));
    }

    if (updates.length === 0) {
      reply.code(400);
      return { error: 'No fields to update' };
    }

    updates.push(`updated_at = NOW()`);
    values.push(slug);

    const {
      rows: [{ id: updatedId }],
    } = await pool.query(
      `UPDATE blogs SET ${updates.join(', ')} WHERE slug = $${idx} RETURNING id`,
      values
    );

    if (!updatedId) {
      reply.code(404);
      return { error: 'Post not found' };
    }

    const {
      rows: [post],
    } = await pool.query(
      `SELECT ${SELECT_PUBLIC_BLOGS}
       FROM blogs b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [updatedId]
    );

    return { post: buildBlogPost(post as BlogRow) };
  });

  app.delete('/blogs/:slug', { preHandler: requireAdmin }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const { rowCount } = await pool.query('DELETE FROM blogs WHERE slug = $1', [slug]);
    if (rowCount === 0) {
      reply.code(404);
      return { error: 'Post not found' };
    }
    return { success: true };
  });
};

export default blogRoutes;
