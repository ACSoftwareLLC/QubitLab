import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  DRAFT_KEY,
  readDraft,
  shouldRestoreDraft,
  useCircuitDraft,
} from "./useCircuitDraft";
import { emptyDoc, docToCircuit } from "./useEditorState";
import type { Circuit } from "../../api/types";

const bellCircuit = (): Circuit => ({
  numBits: 2,
  ops: [
    { id: 1, type: "H", segment: 0, targets: [0], controls: [], angle: null },
    {
      id: 2,
      type: "CX",
      segment: 1,
      targets: [1],
      controls: [0],
      angle: null,
    },
  ],
});

/** Minimal in-memory Storage stand-in. */
function stubStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("shouldRestoreDraft", () => {
  it("restores when there is no handoff or prefetch", () => {
    expect(shouldRestoreDraft(null, null)).toBe(true);
  });
  it("does not restore when a handoff circuit exists", () => {
    expect(shouldRestoreDraft(bellCircuit(), null)).toBe(false);
  });
  it("does not restore when a prefetch exists", () => {
    expect(shouldRestoreDraft(null, bellCircuit())).toBe(false);
  });
});

describe("readDraft", () => {
  it("round-trips a stored draft", () => {
    const storage = stubStorage();
    const draft = { savedAt: 1234, circuit: bellCircuit() };
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    expect(readDraft(storage)).toEqual(draft);
  });

  it("returns null when no draft exists", () => {
    expect(readDraft(stubStorage())).toBeNull();
  });

  it("tolerates corrupt JSON", () => {
    const storage = stubStorage();
    storage.setItem(DRAFT_KEY, "{not json!!");
    expect(readDraft(storage)).toBeNull();
  });

  it("rejects malformed draft shapes", () => {
    const storage = stubStorage();
    storage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: "no", circuit: {} }));
    expect(readDraft(storage)).toBeNull();
    storage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: 5 }));
    expect(readDraft(storage)).toBeNull();
  });
});

describe("useCircuitDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.localStorage.clear();
  });

  it("debounces writes for ~300ms then persists the circuit", () => {
    const { result, rerender } = renderHook(
      ({ doc }) => useCircuitDraft(doc),
      { initialProps: { doc: emptyDoc() } },
    );

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(globalThis.localStorage.getItem(DRAFT_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const stored = readDraft(globalThis.localStorage);
    expect(stored?.circuit).toEqual(docToCircuit(emptyDoc()));

    rerender({
      doc: {
        numBits: 2,
        ops: [
          {
            id: 9,
            type: "H",
            segment: 3,
            targets: [1],
            controls: [],
            angle: null,
          },
        ],
      },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(readDraft(globalThis.localStorage)?.circuit.ops).toHaveLength(1);

    // clear() removes the draft
    act(() => result.current.clear());
    expect(globalThis.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("coalesces rapid changes into one write", () => {
    const proto = Object.getPrototypeOf(globalThis.localStorage);
    const spy = vi.spyOn(proto, "setItem");
    const { rerender } = renderHook(({ doc }) => useCircuitDraft(doc), {
      initialProps: { doc: emptyDoc() },
    });

    for (let i = 0; i < 5; i++) {
      rerender({
        doc: { numBits: 1 + i, ops: [] },
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
