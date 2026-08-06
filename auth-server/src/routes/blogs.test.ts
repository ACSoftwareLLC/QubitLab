import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgres://localhost:5432/quantum_auth',
    sessionSecret: 'test-secret-must-be-at-least-32-characters-long',
    cookieSecure: false,
    nodeEnv: 'test',
    admins: ['@alex'],
    minio: {
      endpoint: 'localhost',
      port: 9000,
      useSsl: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucketAvatars: 'avatars',
      bucketThumbnails: 'circuit-thumbnails',
    },
  },
}));

import { pool } from '../db.js';
import { buildApp } from '../index.js';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;

const blogRow = {
  id: 'blog-1',
  slug: 'hello-world',
  title: 'Hello World',
  content: '<p>First post.</p>',
  author: '@alex',
  published: true,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
};

function mockQueries(handlers: Record<string, (params?: unknown[]) => { rows?: unknown[]; rowCount?: number }>) {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (sql.includes(fragment)) {
        const result = handler(params);
        return Promise.resolve({ rows: [], rowCount: 0, ...result });
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const ADMIN_USER = { id: 'user-1', username: '@alex', pfp_key: null };
const NON_ADMIN_USER = { id: 'user-2', username: 'bob', pfp_key: null };
const ADMIN_COOKIE = 'sessionId=admin-session';
const USER_COOKIE = 'sessionId=user-session';

describe('blog routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists published blog posts without authentication', async () => {
    mockQueries({
      'FROM blogs': () => ({ rows: [blogRow] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/blogs' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      id: 'blog-1',
      slug: 'hello-world',
      title: 'Hello World',
      author: '@alex',
    });
    await app.close();
  });

  it('returns a single published blog post by slug', async () => {
    mockQueries({
      'WHERE slug = $1': () => ({ rows: [blogRow] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/blogs/hello-world' });

    expect(res.statusCode).toBe(200);
    expect(res.json().post).toMatchObject({ slug: 'hello-world', title: 'Hello World' });
    await app.close();
  });

  it('returns 404 for missing posts', async () => {
    mockQueries({
      'WHERE slug = $1': () => ({ rows: [] }),
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/blogs/missing' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('allows admins to create a blog post', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [ADMIN_USER] }),
      'INSERT INTO blogs': () => ({ rows: [blogRow] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/blogs',
      headers: { cookie: ADMIN_COOKIE },
      payload: {
        slug: 'hello-world',
        title: 'Hello World',
        content: '<p>First post.</p>',
        author: '@alex',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().post).toMatchObject({ slug: 'hello-world' });
    await app.close();
  });

  it('rejects blog creation from non-admins', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [NON_ADMIN_USER] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/blogs',
      headers: { cookie: USER_COOKIE },
      payload: {
        slug: 'hello-world',
        title: 'Hello World',
        content: '<p>First post.</p>',
        author: 'bob',
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects blog creation from anonymous users', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/blogs',
      payload: {
        slug: 'hello-world',
        title: 'Hello World',
        content: '<p>First post.</p>',
        author: 'anon',
      },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('allows admins to update a blog post', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [ADMIN_USER] }),
      'UPDATE blogs SET': () => ({ rows: [{ ...blogRow, title: 'Updated' }] }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/blogs/hello-world',
      headers: { cookie: ADMIN_COOKIE },
      payload: { title: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().post.title).toBe('Updated');
    await app.close();
  });

  it('allows admins to delete a blog post', async () => {
    mockQueries({
      'FROM sessions': () => ({ rows: [ADMIN_USER] }),
      'DELETE FROM blogs WHERE slug': () => ({ rowCount: 1 }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/auth/blogs/hello-world',
      headers: { cookie: ADMIN_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});
