import bcrypt from "bcryptjs";
import { base64ToBytes, bytesToBase64, pbkdf2Hash } from "./crypto.js";

// OWASP 2024+ guidance for PBKDF2-HMAC-SHA-256: 600,000 iterations.
// The stored format embeds the iteration count, so hashes created with
// older settings still verify and are upgraded on next login/change.
export const PBKDF2_ITERATIONS = 600_000;
const HASH_FORMAT = "pbkdf2-sha256";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  const hash = bytesToBase64(new Uint8Array(derived));
  return `${HASH_FORMAT}$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${hash}`;
}

// Hashes created by the legacy Docker/Fastify auth-server (bcryptjs, cost 10)
// that survived the migration into D1. They verify via bcrypt and are
// upgraded to PBKDF2 on next successful login (see passwordNeedsRehash).
const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$", "$2x$"] as const;

function isBcryptHash(storedHash: string): boolean {
  return BCRYPT_PREFIXES.some((prefix) => storedHash.startsWith(prefix));
}

/**
 * Returns true when a stored hash does not match the current cost
 * parameters (legacy iteration count or unparseable format) and should
 * be re-hashed after a successful verification.
 */
export function passwordNeedsRehash(storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== HASH_FORMAT) {
    return true;
  }

  const iterations = parseInt(parts[1], 10);
  return !Number.isFinite(iterations) || iterations < PBKDF2_ITERATIONS;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  const parts = storedHash.split("$");
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
