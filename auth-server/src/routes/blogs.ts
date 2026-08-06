import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdmin } from '../hooks/requireAdmin.js';

const createSchema = z.object({
  slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  author: z.string().min(1).max(100),
  published: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

const blogRoutes: FastifyPluginAsync = async (app) => {
  app.get('/blogs', async () => {
    const { rows } = await pool.query(
      `SELECT id, slug, title, content, author, published, created_at, updated_at
       FROM blogs
       WHERE published = TRUE
       ORDER BY created_at DESC`
    );
    return { posts: rows };
  });

  app.get('/blogs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const { rows } = await pool.query(
      `SELECT id, slug, title, content, author, published, created_at, updated_at
       FROM blogs
       WHERE slug = $1 AND published = TRUE`,
      [slug]
    );
    if (rows.length === 0) {
      reply.code(404);
      return { error: 'Post not found' };
    }
    return { post: rows[0] };
  });

  app.post('/blogs', { preHandler: requireAdmin }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const normalizedSlug = slugify(body.slug);
    try {
      const {
        rows: [post],
      } = await pool.query(
        `INSERT INTO blogs(slug, title, content, author, published)
         VALUES($1, $2, $3, $4, $5)
         RETURNING id, slug, title, content, author, published, created_at, updated_at`,
        [normalizedSlug, body.title, body.content, body.author, body.published]
      );
      reply.code(201);
      return { post };
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
    if (body.author !== undefined) {
      updates.push(`author = $${idx++}`);
      values.push(body.author);
    }
    if (body.published !== undefined) {
      updates.push(`published = $${idx++}`);
      values.push(body.published);
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
      rows: [post],
    } = await pool.query(
      `UPDATE blogs SET ${updates.join(', ')} WHERE slug = $${idx}
       RETURNING id, slug, title, content, author, published, created_at, updated_at`,
      values
    );

    if (!post) {
      reply.code(404);
      return { error: 'Post not found' };
    }
    return { post };
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
