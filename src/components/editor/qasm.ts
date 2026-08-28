import type { Circuit, GateOp } from "../../api/types";

/**
 * OPENQASM 2.0 export/import for editor circuits. Pure functions only.
 *
 * Dialect (deliberately narrow — see tests for pinned examples):
 *  - qreg must be named `q`, creg `c`; both are required by the exporter
 *    and tolerated (in any position) by the importer.
 *  - Supported gates map onto the editor's GATE_CONFIGS exactly: h x y z s
 *    t sdg tdg sx id rx(θ) ry rz p u1(→P) cx cz ccx swap, plus
 *    `measure q[i] -> c[i];`. The editor's `C` exports as `cx`.
 *  - `barrier` and line/block comments are skipped silently.
 *  - Angles are exported with 4 significant digits; imports accept plain
 *    decimals and pi expressions (pi, pi/2, 2*pi, 3*pi/4, -pi/2 …).
 *  - One statement per time column in source order; a circuit with more
 *    than 10 gate/measure statements exceeds the editor's column count.
 */

const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";';

/** Editor gate type → qelib1 gate name. `C` is an alias of CX. */
const EXPORT_NAMES: Record<string, string> = {
  H: "h",
  X: "x",
  Y: "y",
  Z: "z",
  S: "s",
  T: "t",
  Sdg: "sdg",
  Tdg: "tdg",
  SX: "sx",
  I: "id",
  Rx: "rx",
  Ry: "ry",
  Rz: "rz",
  P: "p",
  C: "cx",
  CX: "cx",
  CZ: "cz",
  CCX: "ccx",
  SWAP: "swap",
};

/** qelib1 name → editor gate type. `u1` is imported as P. */
const IMPORT_NAMES: Record<string, string> = {
  h: "H",
  x: "X",
  y: "Y",
  z: "Z",
  s: "S",
  t: "T",
  sdg: "Sdg",
  tdg: "Tdg",
  sx: "SX",
  id: "I",
  rx: "Rx",
  ry: "Ry",
  rz: "Rz",
  p: "P",
  u1: "P",
  cx: "CX",
  cz: "CZ",
  ccx: "CCX",
  swap: "SWAP",
};

const PARAMETERIZED = new Set(["rx", "ry", "rz", "p", "u1"]);
const MAX_COLUMNS = 10;
const MAX_QUBITS = 16;

/** 4 significant digits with trailing zeros stripped ("1.571", "0", "6.283"). */
const formatAngle = (rad: number): string => String(Number(rad.toPrecision(4)));

/**
 * Parses a QASM angle expression: decimal ("1.5708") or pi expression
 * ("pi", "pi/2", "2*pi", "3*pi/4", "-pi/2", "1.5*pi/3"). NaN when the
 * expression is not one of these forms.
 */
export function parseAngle(expr: string): number {
  const s = expr.replace(/\s+/g, "");
  const m = /^([+-]?)(?:(?:(\d+(?:\.\d+)?)\*)?pi(?:\/(\d+(?:\.\d+)?))?|(\d+(?:\.\d+)?))$/.exec(
    s,
  );
  if (!m) return Number.NaN;
  const sign = m[1] === "-" ? -1 : 1;
  if (m[4] != null) return sign * Number(m[4]);
  const coeff = m[2] != null ? Number(m[2]) : 1;
  const denom = m[3] != null ? Number(m[3]) : 1;
  return sign * coeff * Math.PI * (denom === 1 ? 1 : 1 / denom);
}

/** Split source into `;`-terminated statements with their starting line
 *  numbers, after stripping comments (newlines preserved for numbering). */
function statementsWithLines(qasm: string): { text: string; line: number }[] {
  // Strip block comments across lines, keeping newlines.
  const noBlocks = qasm.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
  const lines = noBlocks.split("\n").map((l) => l.replace(/\/\/.*$/, ""));
  const out: { text: string; line: number }[] = [];
  let buf = "";
  let bufLine = 1;
  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;
    const chars = lineText.split("");
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ";") {
        const t = buf.trim();
        if (t) out.push({ text: t, line: bufLine });
        buf = "";
      } else {
        // bufLine latches when the statement's first non-space char lands,
        // so whitespace-only carryover between lines can't pin it stale.
        if (!buf.trim() && ch.trim()) bufLine = lineNo;
        buf += ch;
      }
    }
    buf += " "; // statements may span lines
  });
  const t = buf.trim();
  if (t) out.push({ text: t, line: bufLine });
  return out;
}

/** q[i] index from a single argument, or -1 when malformed. */
const qubitIndex = (arg: string): number => {
  const m = /^q\[(\d+)\]$/.exec(arg.trim());
  return m ? Number(m[1]) : -1;
};

/** Serialize a circuit to OPENQASM 2.0. Statements are emitted in segment
 *  order (same segment → ops array order), controls before targets. */
export function circuitToQasm(circuit: Circuit): string {
  const ordered = [...circuit.ops].sort((a, b) => a.segment - b.segment);
  const lines: string[] = [
    HEADER,
    `qreg q[${circuit.numBits}];`,
    `creg c[${circuit.numBits}];`,
  ];

  for (const op of ordered) {
    if (op.type === "M") {
      for (const t of op.targets) lines.push(`measure q[${t}] -> c[${t}];`);
      continue;
    }
    const name = EXPORT_NAMES[op.type];
    if (!name) continue; // unknown types are skipped, like circuitToDoc
    const args = [...op.controls, ...op.targets].map((w) => `q[${w}]`).join(", ");
    if (PARAMETERIZED.has(name)) {
      lines.push(`${name}(${formatAngle(op.angle ?? 0)}) ${args};`);
    } else {
      lines.push(`${name} ${args};`);
    }
  }

  return lines.join("\n") + "\n";
}

/** Parse OPENQASM 2.0 into a Circuit. Any error fails the whole import;
 *  errors carry source line numbers. */
export function qasmToCircuit(qasm: string): { circuit: Circuit } | { errors: string[] } {
  const errors: string[] = [];
  const ops: GateOp[] = [];
  let qregBits: number | null = null;
  let maxIndex = -1;
  let nextId = 1;

  const record = (line: number, message: string) =>
    errors.push(`line ${line}: ${message}`);

  for (const { text, line } of statementsWithLines(qasm)) {
    const lowered = text.toLowerCase();

    // Tolerated anywhere: version header, includes, barriers.
    if (/^openqasm\s+[\d.]+$/.test(lowered)) continue;
    if (/^include\s+"[^"]*"$/.test(lowered)) continue;
    if (/^barrier\b/.test(lowered)) continue;

    // Register declarations.
    const qreg = /^qreg\s+([A-Za-z_]\w*)\s*\[(\d+)\]$/.exec(text);
    if (qreg) {
      if (qreg[1] !== "q") {
        record(line, `unsupported qreg name '${qreg[1]}' (expected q)`);
      } else if (qregBits != null) {
        record(line, "duplicate qreg declaration");
      } else {
        qregBits = Number(qreg[2]);
      }
      continue;
    }
    const creg = /^creg\s+([A-Za-z_]\w*)\s*\[(\d+)\]$/.exec(text);
    if (creg) {
      if (creg[1] !== "c") record(line, `unsupported creg name '${creg[1]}' (expected c)`);
      continue;
    }

    // Measurement: one statement per measured wire.
    const measure = /^measure\s+q\[(\d+)\]\s*->\s*c\[(\d+)\]$/.exec(text);
    if (measure) {
      const qi = Number(measure[1]);
      const ci = Number(measure[2]);
      if (qi !== ci) {
        record(line, `measure target must match (q[${qi}] -> c[${qi}] expected)`);
        continue;
      }
      maxIndex = Math.max(maxIndex, qi);
      ops.push({ id: nextId++, type: "M", segment: 0, targets: [qi], controls: [], angle: null });
      continue;
    }

    // Gate statement: name[(angle)] args...
    const gate = /^([A-Za-z_]\w*)(?:\(([^)]*)\))?\s+(.+)$/.exec(text);
    if (!gate) {
      record(line, `malformed statement '${text}'`);
      continue;
    }
    const [, name, angleExpr, argsText] = gate;
    const type = IMPORT_NAMES[name];
    if (!type) {
      record(line, `unknown gate '${name}'`);
      continue;
    }

    const args = argsText.split(",").map((a) => qubitIndex(a));
    if (args.some((a) => a < 0)) {
      record(line, `malformed qubit argument in '${text}'`);
      continue;
    }
    maxIndex = Math.max(maxIndex, ...args);

    const isParam = PARAMETERIZED.has(name);
    const expectedArity = name === "ccx" ? 3 : name === "swap" ? 2 : ["cx", "cz"].includes(name) ? 2 : 1;
    const arity = isParam ? 1 : expectedArity;
    if (args.length !== arity) {
      record(line, `${name} expects ${arity} qubit argument${arity === 1 ? "" : "s"}, got ${args.length}`);
      continue;
    }

    let angle: number | null = null;
    if (isParam) {
      if (angleExpr == null) {
        record(line, `${name} requires an angle`);
        continue;
      }
      angle = parseAngle(angleExpr);
      if (!Number.isFinite(angle)) {
        record(line, `malformed angle '${angleExpr}'`);
        continue;
      }
    } else if (angleExpr != null) {
      record(line, `${name} does not take an angle`);
      continue;
    }

    let targets: number[];
    let controls: number[];
    if (name === "ccx") {
      controls = args.slice(0, 2);
      targets = [args[2]];
    } else if (name === "cx" || name === "cz") {
      controls = [args[0]];
      targets = [args[1]];
    } else if (name === "swap") {
      targets = args;
      controls = [];
    } else {
      targets = [args[0]];
      controls = [];
    }

    ops.push({ id: nextId++, type, segment: 0, targets, controls, angle });
  }

  if (maxIndex >= MAX_QUBITS) {
    errors.push(`line -?: qubit index ${maxIndex} out of range (max ${MAX_QUBITS - 1})`);
  }

  if (errors.length > 0) return { errors };

  if (ops.length > MAX_COLUMNS) {
    return { errors: [`circuit exceeds ${MAX_COLUMNS} time columns`] };
  }

  // Column assignment: statement order → segment order.
  ops.forEach((op, i) => {
    op.segment = i;
  });

  const numBits = Math.max(
    qregBits != null ? Math.min(qregBits, MAX_QUBITS) : 1,
    maxIndex + 1,
  );

  return { circuit: { numBits, ops } };
}
