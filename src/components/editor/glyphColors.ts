import { GATE_CONFIGS } from "../../constants/gates";
import type { GateConfig, GateType } from "../../types";

/**
 * Category hues for the refined-dark editor theme. Exposed as CSS custom
 * properties with literal fallbacks so SVG glyphs work inside plain SVGs
 * (thumbnails) where the app stylesheet is present anyway, while staying
 * themeable in the app.
 */
export const glyphColor = (type: GateType): string => {
  const category = GATE_CONFIGS[type].category;
  switch (category) {
    case "single":
      return "var(--gate-single, #38bdf8)";
    case "parameterized":
      return "var(--gate-param, #34d399)";
    case "multi":
      return "var(--gate-multi, #c084fc)";
    case "measure":
      return "var(--gate-measure, #94a3b8)";
  }
};

/** Raw fallback colors (for contexts without the app stylesheet). */
export const GLYPH_FALLBACK: Record<GateConfig["category"], string> = {
  single: "#38bdf8",
  parameterized: "#34d399",
  multi: "#c084fc",
  measure: "#94a3b8",
};
