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
/** Matches src/components/editor/gridGeometry.ts MAX_COLUMNS (simulator
 *  ceiling 1024); declared locally to avoid a coupling edit here. */
const MAX_COLUMNS = 1024;
const MAX_QUBITS = 16;
const UNROLL_LIMIT = 2048;

export type ImportResult =
  | { circuit: Circuit; warnings: string[] }
  | { errors: string[] };

/** 4 significant digits with trailing zeros stripped ("1.571", "0", "6.283"). */
const formatAngle = (rad: number): string => String(Number(rad.toPrecision(4)));

/**
 * Parses a QASM angle expression: decimal ("1.5708") or pi expression
 * ("pi", "pi/2", "2*pi", "3*pi/4", "-pi/2", "1.5*pi/3"). NaN when the
 * expression is not one of these forms.
 */
export function parseAngle(expr: string): number {
  const s = expr.replace(/\s+/g, "");
  const m =
    /^([+-]?)(?:(?:(\d+(?:\.\d+)?)\*)?pi(?:\/(\d+(?:\.\d+)?))?|(\d+(?:\.\d+)?))$/.exec(
      s,
    );
  if (!m) return Number.NaN;
  const sign = m[1] === "-" ? -1 : 1;
  if (m[4] != null) return sign * Number(m[4]);
  const coeff = m[2] != null ? Number(m[2]) : 1;
  const denom = m[3] != null ? Number(m[3]) : 1;
  return sign * coeff * Math.PI * (denom === 1 ? 1 : 1 / denom);
}

/** Split source into statements with their starting line numbers, after
 *  stripping comments. Brace-aware: `;` inside { } (macro bodies, loop
 *  bodies) does not terminate a statement; a `}` that closes to depth 0
 *  ends the statement (QASM blocks carry no trailing semicolon). */
function statementsWithLines(qasm: string): { text: string; line: number }[] {
  // Strip block comments across lines, keeping newlines.
  const noBlocks = qasm.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    "\n".repeat(m.split("\n").length - 1),
  );
  const lines = noBlocks.split("\n").map((l) => l.replace(/\/\/.*$/, ""));
  const out: { text: string; line: number }[] = [];
  let buf = "";
  let bufLine = 1;
  let depth = 0;
  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;
    const chars = lineText.split("");
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          // Closing brace of a top-level block ends the statement.
          buf += ch;
          const t = buf.trim();
          if (t) out.push({ text: t, line: bufLine });
          buf = "";
          depth = 0;
          continue;
        }
      }
      if (ch === ";" && depth === 0) {
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
    const args = [...op.controls, ...op.targets]
      .map((w) => `q[${w}]`)
      .join(", ");
    if (PARAMETERIZED.has(name)) {
      lines.push(`${name}(${formatAngle(op.angle ?? 0)}) ${args};`);
    } else {
      lines.push(`${name} ${args};`);
    }
  }

  return lines.join("\n") + "\n";
}

/** Parse OPENQASM into a Circuit. Supports the flat dialect plus the
 *  real-world constructs used by e.g. the Cuccaro adder: gate macros with
 *  parameters (nested calls, no recursion), multi-register declarations
 *  (qreg/qubit, creg/bit), compile-time constants (uint/const), for-loops
 *  unrolled at parse time, compile-time if(bool(...)), indexed and ranged
 *  register access, and reset (treated as a no-op warning).
 *  Any error fails the whole import; errors carry source line numbers. */
export function qasmToCircuit(qasm: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ops: GateOp[] = [];
  let nextId = 1;
  let statementsEmitted = 0;

  // --- Symbol tables -----------------------------------------------------
  type Macro = {
    params: string[];
    body: { text: string; line: number }[];
    line: number;
  };
  const macros = new Map<string, Macro>();
  const consts = new Map<string, number>();
  /** Register name → [startWire, size). Registers concatenate in
   *  declaration order. The flat single register "q" is seeded only when
   *  no explicit qreg/qubit declaration appears (handled after pass 1). */
  const qregs = new Map<string, [number, number]>();
  let nextWire = 0; // total qubits allocated so far
  /** Size declared by the flat dialect's qreg q[n] (numBits comes from it,
   *  floored at max used index). */
  let flatQregBits: number | null = null;
  let maxIndex = -1;

  const record = (line: number, message: string) =>
    errors.push(`line ${line}: ${message}`);

  /** Evaluate an integer/const expression: number literals, declared
   *  consts, loop variables from `env`, unary +/-, + - * and ( ), plus
   *  bit-indexed consts ("a_in[i]" → bit i of constant a_in). Returns null
   *  (recording an error) when unresolvable.
   *
   *  Evaluated by a small recursive-descent parser — NOT `new Function`:
   *  the Worker's CSP blocks unsafe-eval, which silently broke every
   *  expression in production while unit tests (no CSP) kept passing. */
  const evalInt = (
    expr: string,
    line: number,
    env?: Map<string, number>,
  ): number | null => {
    const s = expr.replace(/\s+/g, "");
    // Bit-indexed const: NAME[expr] → bit of the const's value.
    const bitIdx = /^([A-Za-z_]\w*)\[(.+)\]$/.exec(s);
    if (bitIdx) {
      const base = consts.get(bitIdx[1]);
      if (base != null) {
        const idx = evalInt(bitIdx[2], line, env);
        if (idx == null) return null;
        return (base >> idx) & 1;
      }
    }
    // Tokenize: numbers and identifiers.
    const tokens: (number | string)[] = [];
    for (let i = 0; i < s.length; ) {
      const c = s[i];
      if (/[\d]/.test(c)) {
        let j = i;
        while (j < s.length && /[\d]/.test(s[j])) j++;
        tokens.push(Number(s.slice(i, j)));
        i = j;
      } else if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < s.length && /[\w]/.test(s[j])) j++;
        const id = s.slice(i, j);
        const loop = env?.get(id);
        if (loop != null) tokens.push(loop);
        else {
          const v = consts.get(id);
          if (v == null) {
            record(line, `unknown identifier '${id}' in '${expr}'`);
            return null;
          }
          tokens.push(v);
        }
        i = j;
      } else if ("+-*/()".includes(c)) {
        tokens.push(c);
        i++;
      } else {
        return null; // stray character
      }
    }
    // Recursive descent: expr := term (('+'|'-') term)*
    let pos = 0;
    const peek = () => tokens[pos];
    const parseTerm = (): number | null => {
      const v = parseFactor();
      if (v == null) return null;
      while (peek() === "*" || peek() === "/") {
        const op = tokens[pos++] as string;
        const rhs = parseFactor();
        if (rhs == null) return null;
        return op === "*" ? v * rhs : v / rhs;
      }
      return v;
    };
    const parseFactor = (): number | null => {
      // unary +/-
      if (peek() === "-") {
        pos++;
        const v = parseFactor();
        return v == null ? null : -v;
      }
      if (peek() === "+") {
        pos++;
        return parseFactor();
      }
      if (peek() === "(") {
        pos++;
        const v = parseExpr();
        if (v == null || peek() !== ")") return null;
        pos++;
        return v;
      }
      const t = peek();
      if (typeof t === "number") {
        pos++;
        return t;
      }
      return null;
    };
    function parseExpr(): number | null {
      const v = parseTerm();
      if (v == null) return null;
      while (peek() === "+" || peek() === "-") {
        const op = tokens[pos++] as string;
        const rhs = parseTerm();
        if (rhs == null) return null;
        return op === "+" ? v + rhs : v - rhs;
      }
      return v;
    }
    const value = parseExpr();
    if (value == null || pos !== tokens.length || !Number.isFinite(value)) {
      record(line, `cannot evaluate expression '${expr}'`);
      return null;
    }
    return Math.trunc(value);
  };

  /** Resolve one register argument ("cin[0]", "a[i + 1]", "q[3]") to a flat
   *  wire index; null when malformed/out of range. Accepts env for loop
   *  variables inside index expressions. */
  const resolveArg = (
    arg: string,
    line: number,
    env?: Map<string, number>,
  ): number | null => {
    const m = /^([A-Za-z_]\w*)\[(.+)\]$/.exec(arg.trim());
    if (m) {
      const reg = qregs.get(m[1]);
      if (!reg) {
        record(line, `unknown register '${m[1]}'`);
        return null;
      }
      const idx = evalInt(m[2], line, env);
      if (idx == null) return null;
      if (idx < 0 || (idx >= reg[1] && !(m[1] === "q" && idx < MAX_QUBITS))) {
        // The flat dialect's q register is elastic: q[i] beyond the declared
        // qreg size expands the circuit (numBits floors up to max index + 1,
        // matching the pinned contract). Named registers stay strict.
        record(line, `index ${idx} out of range for register '${m[1]}'`);
        return null;
      }
      return reg[0] + idx;
    }
    // Bare register name: single-qubit registers only.
    const bare = qregs.get(arg.trim());
    if (bare && bare[1] === 1) return bare[0];
    record(line, `malformed qubit argument '${arg.trim()}'`);
    return null;
  };

  /** Resolve a possibly-ranged argument to one or more flat wires. */
  const resolveArgs = (
    arg: string,
    line: number,
    env?: Map<string, number>,
  ): number[] => {
    const m = /^([A-Za-z_]\w*)\[(.+?):(.+?)\]$/.exec(arg.trim());
    if (m) {
      const reg = qregs.get(m[1]);
      if (!reg) {
        record(line, `unknown register '${m[1]}'`);
        return [];
      }
      const lo = evalInt(m[2], line, env);
      const hi = evalInt(m[3], line, env);
      if (lo == null || hi == null) return [];
      if (lo > hi || lo < 0 || hi >= reg[1]) {
        record(line, `range [${lo}:${hi}] invalid for register '${m[1]}'`);
        return [];
      }
      const out: number[] = [];
      for (let i = lo; i <= hi; i++) out.push(reg[0] + i);
      return out;
    }
    const single = resolveArg(arg, line, env);
    return single == null ? [] : [single];
  };

  // --- Statement expansion (macros + loops + conditionals) --------------
  type Stmt = { text: string; line: number };
  /** Expand a statement list, honoring macro calls, for-loops and
   *  compile-time ifs. env maps loop variables to their current values. */
  const expand = (
    stmts: Stmt[],
    env: Map<string, number>,
    depth: number,
  ): Stmt[] => {
    const out: Stmt[] = [];
    for (const { text, line } of stmts) {
      if (statementsEmitted + out.length > UNROLL_LIMIT) {
        record(line, "circuit too large after unrolling");
        return out;
      }

      // gate MACRO args ;  (macro invocation)
      const macroCall = /^([A-Za-z_]\w*)\s+([^{};]+)$/.exec(text);
      if (macroCall && macros.has(macroCall[1])) {
        const name = macroCall[1];
        const macro = macros.get(name)!;
        if (depth > 16) {
          record(line, `macro expansion too deep at '${name}' (recursion?)`);
          continue;
        }
        const callArgs = macroCall[2].split(",").map((a) => a.trim());
        if (callArgs.length !== macro.params.length) {
          record(
            line,
            `macro '${name}' expects ${macro.params.length} args, got ${callArgs.length}`,
          );
          continue;
        }
        // Bind params to *textual* argument expressions (word-boundary
        // substitution — single-letter params must not hit gate names like
        // the c in "cx"), then re-expand the body so nested macros see them.
        const bound = macro.body.map(({ text: t, line: l }) => ({
          text: macro.params.reduce(
            (acc, p, i) =>
              acc.replace(new RegExp(`\\b${p}\\b`, "g"), callArgs[i]),
            t,
          ),
          line: l,
        }));
        out.push(...expand(bound, env, depth + 1));
        continue;
      }

      // for <var> in [A : B] { ... }  (also [A : step : B] with negative step)
      const loop =
        /^for\s+\w*\s*(\w+)\s+in\s*\[\s*(.+?)\s*\]\s*\{([\s\S]*)\}$/.exec(text);
      if (loop) {
        const [, v, range, bodyText] = loop;
        const parts = range.split(":").map((p) => p.trim());
        const lo = evalInt(parts[0], line, env);
        const hi = evalInt(parts[parts.length - 1], line, env);
        if (lo == null || hi == null) continue;
        const step = parts.length === 3 ? (hi >= lo ? 1 : -1) : 1;
        const body = statementsWithLines(bodyText + ";");
        for (let i = lo; step > 0 ? i <= hi : i >= hi; i += step) {
          env.set(v, i);
          out.push(...expand(body, env, depth + 1));
          if (statementsEmitted + out.length > UNROLL_LIMIT) {
            record(line, "circuit too large after unrolling");
            return out;
          }
        }
        env.delete(v);
        continue;
      }

      // if (bool(expr)) stmt  — compile-time conditional.
      const cond = /^if\s*\(\s*bool\s*\(\s*(.+?)\s*\)\s*\)\s*(.+)$/.exec(text);
      if (cond) {
        const v = evalInt(cond[1], line, env);
        if (v != null && v !== 0) {
          out.push(...expand([{ text: cond[2], line }], env, depth + 1));
        }
        continue;
      }

      // Plain statement: bake loop variables into the text (word
      // boundaries) so downstream resolution sees concrete numbers —
      // pass 2 evaluates emitted statements without the loop env.
      const resolvedText = [...env.entries()].reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\b${k}\\b`, "g"), String(v)),
        text,
      );
      out.push({ text: resolvedText, line });
    }
    return out;
  };

  // --- Pass 1: collect macros, consts, registers -------------------------
  let resetCount = 0;
  const stmts = statementsWithLines(qasm);
  const pending: Stmt[] = [];
  for (const { text, line } of stmts) {
    const lowered = text.toLowerCase();

    if (/^openqasm\s+[\d.]+$/.test(lowered)) continue;
    if (/^include\s+"[^"]*"$/.test(lowered)) continue;
    if (/^barrier\b/.test(lowered)) continue;

    // const NAME = value;  /  uint[n] NAME = value;
    const constDecl =
      /^(?:const|uint(?:\[\d+\])?)\s+([A-Za-z_]\w*)\s*=\s*([\d+\-*/()\s]+)$/.exec(
        text,
      );
    if (constDecl) {
      const v = evalInt(constDecl[2], line);
      if (v != null) consts.set(constDecl[1], v);
      else record(line, `cannot evaluate constant '${constDecl[1]}'`);
      continue;
    }

    // gate NAME params { body } — macro definition. Body statements are
    // re-extracted raw (statementsWithLines over the brace text).
    const macroDecl = /^gate\s+([A-Za-z_]\w*)\s*([^{};]*)\{([\s\S]*)\}$/.exec(
      text,
    );
    if (macroDecl) {
      const params = macroDecl[2].trim()
        ? macroDecl[2]
            .trim()
            .split(",")
            .map((p) => p.trim())
        : [];
      macros.set(macroDecl[1], {
        params,
        body: statementsWithLines(macroDecl[3] + ";"),
        line,
      });
      continue;
    }

    // qreg name[n];  (QASM2 order)  /  qubit[n] name;  or  qubit name;  (QASM3 order)
    const qdecl =
      /^qreg\s+([A-Za-z_]\w*)\s*\[(\d+)\]$/.exec(text) ??
      /^qubit\s*(?:\[(\d+)\]\s*)?([A-Za-z_]\w*)$/.exec(text);
    if (qdecl) {
      // QASM2 form captures [name, size]; QASM3 form captures [size, name].
      const name = qdecl[1] != null && /^qreg/.test(text) ? qdecl[1] : qdecl[2];
      const sizeStr = /^qreg/.test(text) ? qdecl[2] : qdecl[1];
      const size = sizeStr != null ? Number(sizeStr) : 1;
      if (qregs.has(name)) {
        record(line, `duplicate register '${name}'`);
      } else if (nextWire + size > MAX_QUBITS) {
        record(
          line,
          `circuit needs ${nextWire + size} qubits; editor supports ${MAX_QUBITS}`,
        );
      } else {
        qregs.set(name, [nextWire, size]);
        nextWire += size;
        if (name === "q" && /^qreg/.test(text)) flatQregBits = size;
      }
      continue;
    }

    // bit[n] name; / creg name[n]; — classical, sizes tolerated.
    if (/^(?:bit|creg)\b/.test(lowered)) continue;

    // reset <reg>; — no-op (qubits start |0⟩ in this editor).
    if (/^reset\b/.test(lowered)) {
      resetCount++;
      continue;
    }

    pending.push({ text, line });
  }
  if (resetCount > 0)
    warnings.push(
      `skipped ${resetCount} reset statement(s) — qubits start in |0⟩`,
    );

  // --- Pass 2: expand + execute -------------------------------------------
  // Flat dialect default: with no explicit register declaration, "q" spans
  // the whole wire range (measure q[i]/gate q[i] style sources).
  if (nextWire === 0) qregs.set("q", [0, MAX_QUBITS]);

  for (const { text, line } of expand(pending, new Map(), 0)) {
    statementsEmitted++;
    const env = new Map<string, number>(); // top level: no loop vars in flight

    // measure q[i] -> c[j]; / measure q[lo:hi] -> c[lo:hi];
    const measure = /^measure\s+(.+?)\s*->\s*(.+)$/.exec(text);
    if (measure) {
      // Flat-dialect guard: q[i] -> c[j] with i ≠ j is rejected.
      const flatIdx = /^q\[(\d+)\]$/.exec(measure[1].trim());
      const flatC = /^c\[(\d+)\]$/.exec(measure[2].trim());
      if (flatIdx && flatC && Number(flatIdx[1]) !== Number(flatC[1])) {
        record(
          line,
          `measure target must match (q[${flatIdx[1]}] -> c[${flatIdx[1]}] expected)`,
        );
        continue;
      }
      const src = resolveArgs(measure[1], line, env);
      for (const w of src) {
        maxIndex = Math.max(maxIndex, w);
        ops.push({
          id: nextId++,
          type: "M",
          segment: 0,
          targets: [w],
          controls: [],
          angle: null,
        });
      }
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

    const args = argsText.split(",").flatMap((a) => resolveArgs(a, line, env));
    if (args.length === 0 || errors.length > 0) continue;
    maxIndex = Math.max(maxIndex, ...args);

    const isParam = PARAMETERIZED.has(name);
    const expectedArity =
      name === "ccx"
        ? 3
        : name === "swap"
          ? 2
          : ["cx", "cz"].includes(name)
            ? 2
            : 1;
    const arity = isParam ? 1 : expectedArity;
    if (args.length !== arity) {
      record(
        line,
        `${name} expects ${arity} qubit argument${arity === 1 ? "" : "s"}, got ${args.length}`,
      );
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
    errors.push(`qubit index ${maxIndex} out of range (max ${MAX_QUBITS - 1})`);
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
    flatQregBits != null ? flatQregBits : nextWire,
    maxIndex + 1,
  );

  return { circuit: { numBits: Math.min(numBits, MAX_QUBITS), ops }, warnings };
}
