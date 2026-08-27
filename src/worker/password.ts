import bcrypt from "bcryptjs";
import { base64ToBytes, bytesToBase64, pbkdf2Hash } from "./crypto.js";

// OWASP 2024+ guidance for PBKDF2-HMAC-SHA-256 is 600,000 iterations, but the
// deployed Cloudflare Workers runtime rejects deriveBits/deriveKey above
// 100,000 iterations (NotSupportedError) while local workerd accepts them —
// see docs/superpowers/debug/2026-08-27-login-500-bcrypt-migrations.md.
// We pin to the platform ceiling: still a strong KDF for this threat model
// (unique 16-byte salt per hash, login rate-limited 10/15min per IP, Turnstile
// on registration), and the stored format embeds the count so a future bump
// rehashes transparently on next login/change.
export const PBKDF2_ITERATIONS = 100_000;
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

  let salt: Uint8Array<ArrayBuffer>;
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
