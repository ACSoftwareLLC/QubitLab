import { describe, it, expect, vi } from 'vitest';
import { queryFirst, queryAll, runQuery, uniqueConstraintError } from './db.js';
import type { HonoContext } from './types.js';

function makeFakeContext(db: unknown): HonoContext {
  return {
    env: { DB: db },
  } as unknown as HonoContext;
}

function mockD1First(result: unknown) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function mockD1All(results: unknown[]) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({ results }),
      })),
    })),
  };
}

function mockD1Run(success: boolean) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ success }),
      })),
    })),
  };
}

describe('db helpers', () => {
  it('queryFirst returns the first row', async () => {
    const db = mockD1First({ id: '1', name: 'Alice' });
    const c = makeFakeContext(db);
    const row = await queryFirst<{ id: string; name: string }>(
      c,
      'SELECT * FROM users WHERE id = ?',
      ['1']
    );
    expect(row).toEqual({ id: '1', name: 'Alice' });
    expect(db.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
  });

  it('queryFirst returns null when no row is found', async () => {
    const db = mockD1First(null);
    const c = makeFakeContext(db);
    const row = await queryFirst(c, 'SELECT * FROM users WHERE id = ?', ['2']);
    expect(row).toBeNull();
  });

  it('queryAll returns all rows', async () => {
    const db = mockD1All([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    const c = makeFakeContext(db);
    const rows = await queryAll<{ id: string; name: string }>(
      c,
      'SELECT * FROM users'
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('Bob');
  });

  it('queryAll returns an empty array when results is missing', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({}),
        })),
      })),
    };
    const c = makeFakeContext(db);
    const rows = await queryAll(c, 'SELECT * FROM users');
    expect(rows).toEqual([]);
  });

  it('runQuery returns the D1 result', async () => {
    const db = mockD1Run(true);
    const c = makeFakeContext(db);
    const result = await runQuery(c, 'INSERT INTO users (id) VALUES (?)', ['1']);
    expect(result.success).toBe(true);
  });

  it('identifies a unique constraint error by cause code 2067', () => {
    const err = new Error('D1 error');
    (err as { cause?: { error: number } }).cause = { error: 2067 };
    expect(uniqueConstraintError(err)).toBe(true);
  });

  it('identifies a unique constraint error by cause code 2069', () => {
    const err = new Error('D1 error');
    (err as { cause?: { error: number } }).cause = { error: 2069 };
    expect(uniqueConstraintError(err)).toBe(true);
  });

  it('identifies a unique constraint error by message', () => {
    const err = new Error('UNIQUE constraint failed: users.username');
    expect(uniqueConstraintError(err)).toBe(true);
  });

  it('returns false for non-constraint errors', () => {
    expect(uniqueConstraintError(new Error('some error'))).toBe(false);
    expect(uniqueConstraintError(null)).toBe(false);
    expect(uniqueConstraintError('string')).toBe(false);
  });
});
