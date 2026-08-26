import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
  PBKDF2_ITERATIONS,
} from "./password.js";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("password123");
    expect(hash).toContain("pbkdf2-sha256$");
    expect(await verifyPassword("password123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it(`embeds ${PBKDF2_ITERATIONS} iterations in new hashes`, async () => {
    const hash = await hashPassword("password123");
    const [format, iterations] = hash.split("$");
    expect(format).toBe("pbkdf2-sha256");
    expect(iterations).toBe(String(PBKDF2_ITERATIONS));
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("still verifies hashes created by older versions", async () => {
    // A hash produced by the previous 100k-iteration implementation.
    const legacyHash = await pbkdf2Sha256("password123", 100_000);
    expect(await verifyPassword("password123", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
  });

  it("flags legacy and malformed hashes for rehash", async () => {
    const legacyHash = await pbkdf2Sha256("password123", 100_000);
    const currentHash = await hashPassword("password123");
    expect(passwordNeedsRehash(legacyHash)).toBe(true);
    expect(passwordNeedsRehash(currentHash)).toBe(false);
    expect(passwordNeedsRehash("not-a-hash")).toBe(true);
    expect(passwordNeedsRehash("pbkdf2-sha256$abc$salt$hash")).toBe(true);
  });

  it("returns false for an invalid hash format", async () => {
    expect(await verifyPassword("password123", "not-a-hash")).toBe(false);
  });

  it("still verifies pre-migration bcrypt hashes from the legacy auth-server", async () => {
    const legacyBcryptHash = bcrypt.hashSync("password123", 10);
    expect(legacyBcryptHash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("password123", legacyBcryptHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyBcryptHash)).toBe(false);
  });
});

/** Builds a hash in the stored format with an explicit iteration count. */
async function pbkdf2Sha256(
  password: string,
  iterations: number,
): Promise<string> {
  const { bytesToBase64, pbkdf2Hash } = await import("./crypto.js");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2Hash(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derived))}`;
}
