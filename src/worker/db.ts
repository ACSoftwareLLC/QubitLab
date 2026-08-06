import type { HonoContext } from './types.js';

export type D1ResultRow = Record<string, unknown>;

export async function queryFirst<T = D1ResultRow>(
  c: HonoContext,
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await c.env.DB.prepare(sql).bind(...(params ?? [])).first<T>();
  return result ?? null;
}

export async function queryAll<T = D1ResultRow>(
  c: HonoContext,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await c.env.DB.prepare(sql).bind(...(params ?? [])).all<T>();
  return result.results ?? [];
}

export async function runQuery(
  c: HonoContext,
  sql: string,
  params?: unknown[]
): Promise<D1Result> {
  return c.env.DB.prepare(sql).bind(...(params ?? [])).run();
}

export function uniqueConstraintError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;

  const cause = (err as { cause?: { error?: number; message?: string } }).cause;
  if (cause?.error === 2069 || cause?.error === 2067) {
    return true;
  }

  const message = String((err as { message?: string }).message ?? cause?.message ?? '');
  return message.includes('UNIQUE constraint failed');
}
