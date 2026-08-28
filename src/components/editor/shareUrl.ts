import { GATE_CONFIGS } from "../../constants/gates";
import type { Circuit } from "../../api/types";

/**
 * Shareable circuit URLs: the circuit JSON is embedded in the URL hash
 * (#c=<base64url>) so links work without login or a backend round-trip.
 *
 * All functions are pure except buildShareUrl (reads window.location).
 * Decoding is strict: any failure yields null — a malformed hash must
 * never half-load a circuit.
 */

/** base64 → base64url: + → -, / → _, strip trailing = padding. */
const toBase64Url = (b64: string): string =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (b64url: string): string =>
  b64url.replace(/-/g, "+").replace(/_/g, "/");

/** Encode a circuit as a compact base64url hash fragment. */
export function encodeCircuitToHash(circuit: Circuit): string {
  const json = JSON.stringify(circuit);
  // encodeURIComponent handles UTF-8 before btoa (btoa is latin-1 only).
  const b64 = btoa(encodeURIComponent(json));
  return toBase64Url(b64);
}

/** Strict shape validation: mirrors circuitToDoc's known-gate filter. */
function isValidCircuit(value: unknown): value is Circuit {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Circuit>;
  if (!Number.isInteger(c.numBits) || c.numBits! < 1 || c.numBits! > 16)
    return false;
  if (!Array.isArray(c.ops)) return false;
  return c.ops.every(
    (op) =>
      op &&
      typeof op === "object" &&
      typeof op.type === "string" &&
      op.type in GATE_CONFIGS,
  );
}

/** Decode a #c= hash fragment back to a Circuit; null on ANY failure. */
export function decodeHashToCircuit(hash: string): Circuit | null {
  try {
    const json = decodeURIComponent(atob(fromBase64Url(hash)));
    const parsed: unknown = JSON.parse(json);
    return isValidCircuit(parsed) ? parsed : null;
  } catch {
    // Invalid base64, invalid UTF-8, corrupt JSON — all null.
    return null;
  }
}

/** Full shareable URL for the current document origin. */
export function buildShareUrl(circuit: Circuit): string {
  return `${window.location.origin}/editor-v2#c=${encodeCircuitToHash(circuit)}`;
}
