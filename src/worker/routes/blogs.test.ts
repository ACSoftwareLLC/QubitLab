import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import app from '../index.js';

function mockD1(
  handlers: Record<string, (sql: string, params: unknown[]) => unknown>
): D1Database {
  let currentSql = '';
  let currentParams: unknown[] = [];

  const prepared = {
    bind: vi.fn((...params: unknown[]) => {
      currentParams = params;
      return prepared;
    }),
    first: vi.fn(async <T>() => {
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          const result = handler(currentSql, currentParams);
          return Array.isArray(result) ? (result[0] as T) : (result as T);
        }
      }
      return null;
    }),
    all: vi.fn(async <T>() => {
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          const result = handler(currentSql, currentParams);
          return { results: Array.isArray(result) ? (result as T[]) : [] } as {
            results: T[];
          };
        }
      }
      return { results: [] as T[] };
    }),
    run: vi.fn(async () => {
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (currentSql.includes(fragment)) {
          return handler(currentSql, currentParams) as { success: true };
        }
      }
      return { success: true };
    }),
    raw: vi.fn(),
  };

  return {
    prepare: vi.fn((sql: string) => {
      currentSql = sql;
      currentParams = [];
      return prepared;
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

function mockR2(): R2Bucket {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

const SESSION_USER = {
  id: 'user-1',
  username: 'alice',
  password_hash: 'hash',
  pfp_key: null,
  first_name: 'Alice',
  last_name: 'Admin',
  bio: 'Admin bio',
  is_admin: 1,
  created_at: '2026-07-01T00:00:00Z',
};

const ADMIN_COOKIE = 'sessionId=admin-session';
const USER_COOKIE = 'sessionId=user-session';

function makeEnv(
  d1Handlers: Record<string, (sql: string, params: unknown[]) => unknown> = {},
  user = SESSION_USER
) {
  return {
    DB: mockD1({
      'FROM sessions': () => [user],
      'FROM users WHERE id': () => [user],
      ...d1Handlers,
    }),
    AVATARS: mockR2(),
    THUMBNAILS: mockR2(),
    SESSION_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
  };
}

function makePostRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    slug: 'hello-world',
    title: 'Hello World',
    content: 'This is a post.',
    author: 'Alice Admin',
    published: 1,
    publish_at: '2026-07-01T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    user_id: 'user-1',
    author_username: 'alice',
    author_pfp_key: null,
    author_first_name: 'Alice',
    author_last_name: 'Admin',
    author_bio: 'Admin bio',
    author_is_admin: 1,
    ...overrides,
  };
}

let uuidCounter = 0;

describe('blog routes', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1;
      return `uuid-${uuidCounter}`;
    });
  });

  it('lists only published posts for guests', async () => {
    const env = makeEnv({
      'FROM blogs b': () => [
        makePostRow({ slug: 'public-post', title: 'Public', published: 1, publish_at: null }),
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { posts: unknown[] };
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      slug: 'public-post',
      title: 'Public',
      published: true,
    });
  });

  it('lists all posts for admins', async () => {
    const env = makeEnv({
      'FROM blogs b': () => [
        makePostRow({ slug: 'draft-post', title: 'Draft', published: 0 }),
      ],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { posts: unknown[] };
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      slug: 'draft-post',
      title: 'Draft',
      published: false,
    });
  });

  it('rejects non-admin create', async () => {
    const env = makeEnv({}, { ...SESSION_USER, is_admin: 0 });
    const res = await app.fetch(
      new Request('http://localhost/auth/blogs', {
        method: 'POST',
        headers: { Cookie: USER_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'new-post',
          title: 'New Post',
          content: 'Content',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(403);
  });

  it('creates a published post', async () => {
    const env = makeEnv({
      'INSERT INTO blogs': () => ({ id: 'uuid-1' }),
      'FROM blogs b': () => [makePostRow({ id: 'uuid-1', slug: 'new-post', title: 'New Post' })],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs', {
        method: 'POST',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'new-post',
          title: 'New Post',
          content: 'Content',
        }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { post: { slug: string; title: string; published: boolean } };
    expect(body.post.slug).toBe('new-post');
    expect(body.post.title).toBe('New Post');
    expect(body.post.published).toBe(true);
  });

  it('updates a post', async () => {
    const env = makeEnv({
      'FROM blogs WHERE slug': () => [{ id: 'post-1', slug: 'hello-world', published: 1, publish_at: '2026-07-01T00:00:00Z' }],
      'UPDATE blogs SET': () => ({ id: 'post-1' }),
      'FROM blogs b': () => [makePostRow({ title: 'Updated Title' })],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs/hello-world', {
        method: 'PATCH',
        headers: { Cookie: ADMIN_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { post: { title: string } };
    expect(body.post.title).toBe('Updated Title');
  });

  it('deletes a post', async () => {
    const env = makeEnv({
      'FROM blogs WHERE slug': () => [{ id: 'post-1' }],
      'DELETE FROM blogs': () => ({ success: true }),
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs/hello-world', {
        method: 'DELETE',
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns 404 for missing post', async () => {
    const env = makeEnv({
      'FROM blogs b': () => [],
    });

    const res = await app.fetch(
      new Request('http://localhost/auth/blogs/missing'),
      env as unknown as Record<string, unknown>,
      mockExecutionCtx()
    );
    expect(res.status).toBe(404);
  });
});
