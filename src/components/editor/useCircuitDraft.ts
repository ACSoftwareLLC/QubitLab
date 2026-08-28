import { useCallback, useEffect, useRef, useState } from "react";
import type { Circuit } from "../../api/types";
import { docToCircuit, type EditorDoc } from "./useEditorState";

/**
 * localStorage draft persistence for the v2 editor: survives a refresh
 * until the circuit is saved (the page clears the draft on save) or
 * another circuit/template is handed off (handoffs take priority).
 *
 * Failures (no localStorage, quota, corrupt JSON) silently disable
 * persistence — drafts are best-effort, never blocking.
 */

export const DRAFT_KEY = "ev2-draft";

export type CircuitDraft = {
  savedAt: number;
  circuit: Circuit;
};

/** A draft is only restored when no explicit handoff took priority. */
export function shouldRestoreDraft(
  handoff: Circuit | null,
  prefetch: Circuit | null,
): boolean {
  return handoff == null && prefetch == null;
}

/** Read and validate a stored draft; null when absent or unreadable. */
export function readDraft(
  storage: Pick<Storage, "getItem"> = globalThis.localStorage,
): CircuitDraft | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CircuitDraft>;
    if (
      typeof parsed.savedAt !== "number" ||
      !parsed.circuit ||
      typeof parsed.circuit !== "object" ||
      !Array.isArray(parsed.circuit.ops)
    ) {
      return null;
    }
    return { savedAt: parsed.savedAt, circuit: parsed.circuit as Circuit };
  } catch {
    return null;
  }
}

const DEBOUNCE_MS = 300;

/**
 * Persists `doc` to localStorage (debounced) on every change. The read
 * side is explicit via readDraft/shouldRestoreDraft so the page can
 * resolve the draft-vs-handoff priority once, on mount.
 *
 * @returns clear() — removes the draft (the page calls it after a save).
 */
export function useCircuitDraft(doc: EditorDoc) {
  const [available] = useState(() => {
    try {
      return typeof globalThis.localStorage !== "undefined";
    } catch {
      return false;
    }
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!available) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const draft: CircuitDraft = { savedAt: Date.now(), circuit: docToCircuit(doc) };
        globalThis.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Quota/security errors disable persistence silently.
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doc, available]);

  const clear = useCallback(() => {
    try {
      globalThis.localStorage?.removeItem(DRAFT_KEY);
    } catch {
      // No storage: nothing to clear.
    }
  }, []);

  return { clear };
}
