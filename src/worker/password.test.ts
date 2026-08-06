import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('password123');
    expect(hash).toContain('pbkdf2-sha256$');
    expect(await verifyPassword('password123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('returns false for an invalid hash format', async () => {
    expect(await verifyPassword('password123', 'not-a-hash')).toBe(false);
  });
});
