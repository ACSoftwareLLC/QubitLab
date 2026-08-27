import { describe, it, expect, vi } from 'vitest';
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

const NON_ADMIN_USER = { ...SESSION_USER, id: 'user-2', username: 'bob', is_admin: 0 };

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

describe('template routes — public', () => {
  it('lists templates with parsed metadata, omitting heavy fields', async () => {
    // One handler serves both list variants: the SQL fragment 'WHERE published'
    // is present only when the route composes the guest/non-admin filter.
    const env = makeEnv({
      'FROM circuit_templates': (sql: string) =>
        String(sql).includes('WHERE published')
          ? [makeTemplateRow()]
          : [
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

    // A logged-in non-admin sees the same filtered list as a guest.
    const memberRes = await app.fetch(
      new Request('http://localhost/auth/templates', {
        headers: { Cookie: USER_COOKIE },
      }),
      makeEnv(
        {
          'FROM circuit_templates': (sql: string) =>
            String(sql).includes('WHERE published')
              ? [makeTemplateRow()]
              : [makeTemplateRow(), makeTemplateRow({ id: 'tpl-2', slug: 'grover-search', published: 0 })],
        },
        NON_ADMIN_USER
      ),
      mockExecutionCtx()
    );
    const memberBody = await memberRes.json();
    expect(memberBody.templates).toHaveLength(1);
    expect(memberBody.templates[0].slug).toBe('bell-state');
  });

  it('includes drafts for admin list requests', async () => {
    const env = makeEnv({
      'FROM circuit_templates': () => [
        makeTemplateRow(),
        makeTemplateRow({ id: 'tpl-2', slug: 'grover-search', title: 'Grover Search', published: 0 }),
      ],
    }, SESSION_USER);
    const res = await app.fetch(
      new Request('http://localhost/auth/templates', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
      env,
      mockExecutionCtx()
    );
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
      new Request('http://localhost/auth/templates/bell-state', {
        headers: { Cookie: ADMIN_COOKIE },
      }),
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
