import type { Context } from 'hono';
import type { SafeParseReturnType, ZodError } from 'zod';

export function jsonError(c: Context, message: string, status: number) {
  return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
}

export function formatZodError<T>(result: SafeParseReturnType<T, T>): string {
  if (result.success) return '';
  const issues = (result.error as ZodError).issues;
  return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}

export function handleZodError<T>(c: Context, result: SafeParseReturnType<T, T>) {
  if (result.success) return null;
  return jsonError(c, formatZodError(result), 400);
}
