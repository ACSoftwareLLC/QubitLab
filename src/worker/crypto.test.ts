import { describe, it, expect } from 'vitest';
import { sha256Hex, bytesToHex, hexToBytes, base64ToBytes, bytesToBase64 } from './crypto.js';

describe('crypto', () => {
  it('computes SHA-256 hex', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('round-trips bytes and hex', () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 64]);
    const hex = bytesToHex(bytes);
    expect(hexToBytes(hex)).toEqual(bytes);
  });

  it('round-trips bytes and base64', () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 64]);
    const base64 = bytesToBase64(bytes);
    expect(base64ToBytes(base64)).toEqual(bytes);
  });
});
