import { base64ToBytes, bytesToBase64, pbkdf2Hash } from './crypto.js';

const PBKDF2_ITERATIONS = 100_000;
const HASH_FORMAT = 'pbkdf2-sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  const hash = bytesToBase64(new Uint8Array(derived));
  return `${HASH_FORMAT}$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_FORMAT) {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  let salt: Uint8Array;
  let expectedHash: Uint8Array;
  try {
    salt = base64ToBytes(parts[2]);
    expectedHash = base64ToBytes(parts[3]);
  } catch {
    return false;
  }

  const derived = await pbkdf2Hash(password, salt, iterations);
  const actualHash = new Uint8Array(derived);

  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}
