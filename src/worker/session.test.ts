import { describe, it, expect, vi } from 'vitest';
import { deleteExpiredSessions } from './session.js';

describe('deleteExpiredSessions', () => {
  it('deletes expired sessions and returns the count', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ run })) }));
    const db = { prepare } as unknown as import('@cloudflare/workers-types').D1Database;

    const deleted = await deleteExpiredSessions(db);

    expect(deleted).toBe(3);
    expect(prepare).toHaveBeenCalledWith('DELETE FROM sessions WHERE expires_at <= ?');
  });

  it('returns zero when meta is missing', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const prepare = vi.fn(() => ({ bind: vi.fn(() => ({ run })) }));
    const db = { prepare } as unknown as import('@cloudflare/workers-types').D1Database;

    const deleted = await deleteExpiredSessions(db);
    expect(deleted).toBe(0);
  });
});
