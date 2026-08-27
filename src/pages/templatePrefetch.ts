import type { Circuit } from '../api/types';

/** sessionStorage key shared between TemplateDetailPage and EditorPage. */
export const TEMPLATE_PREFETCH_KEY = 'qubitlab.template-prefetch';

/**
 * Reads and clears the template hand-off written by TemplateDetailPage.
 * Returns null for missing or malformed payloads; the key is ALWAYS cleared.
 */
export function consumeTemplatePrefetch(): {
  title: string;
  circuit: Circuit;
} | null {
  const raw = sessionStorage.getItem(TEMPLATE_PREFETCH_KEY);
  sessionStorage.removeItem(TEMPLATE_PREFETCH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { title?: unknown; circuit?: unknown };
    const circuit = parsed.circuit as
      | { numBits?: unknown; ops?: unknown }
      | null;
    if (
      typeof parsed.title === 'string' &&
      circuit &&
      typeof circuit === 'object' &&
      typeof circuit.numBits === 'number' &&
      Array.isArray(circuit.ops)
    ) {
      // SAFETY: shape-validated above (string title, numeric numBits, array ops);
      // Circuit's remaining fields flow through the trusted editor serializer.
      return { title: parsed.title, circuit: circuit as unknown as Circuit };
    }
    return null;
  } catch {
    return null;
  }
}
