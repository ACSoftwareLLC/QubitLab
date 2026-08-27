import { describe, it, expect, afterEach } from 'vitest';
import {
  TEMPLATE_PREFETCH_KEY,
  consumeTemplatePrefetch,
} from './templatePrefetch';
import type { Circuit } from '../api/types';

afterEach(() => sessionStorage.clear());

const circuit: Circuit = {
  numBits: 2,
  ops: [
    { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
    { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
  ],
};

describe('consumeTemplatePrefetch', () => {
  it('returns and clears a valid payload', () => {
    sessionStorage.setItem(
      TEMPLATE_PREFETCH_KEY,
      JSON.stringify({ title: 'Bell State', circuit })
    );
    const result = consumeTemplatePrefetch();
    expect(result?.title).toBe('Bell State');
    expect(result?.circuit.ops).toHaveLength(2);
    expect(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)).toBeNull();
  });

  it('returns null for malformed payloads and still clears', () => {
    sessionStorage.setItem(TEMPLATE_PREFETCH_KEY, '{"broken":');
    expect(consumeTemplatePrefetch()).toBeNull();
    expect(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(consumeTemplatePrefetch()).toBeNull();
  });
});
