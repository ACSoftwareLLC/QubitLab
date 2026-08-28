import { describe, expect, it } from "vitest";
import { circuitToQasm, parseAngle, qasmToCircuit } from "./qasm";
import type { Circuit } from "../../api/types";

const op = (
  id: number,
  type: string,
  segment: number,
  targets: number[],
  controls: number[] = [],
  angle: number | null = null,
) => ({ id, type, segment, targets, controls, angle });

const bell: Circuit = {
  numBits: 2,
  ops: [
    op(1, "H", 0, [0]),
    op(2, "CX", 1, [1], [0]),
    op(3, "M", 2, [0]),
    op(4, "M", 3, [1]),
  ],
};

const equivalent = (a: Circuit, b: Circuit) => {
  expect(a.numBits).toBe(b.numBits);
  expect(a.ops.length).toBe(b.ops.length);
  a.ops.forEach((aop, i) => {
    const bop = b.ops[i];
    expect(aop.type).toBe(bop.type);
    expect(aop.segment).toBe(bop.segment);
    expect(aop.targets).toEqual(bop.targets);
    expect(aop.controls).toEqual(bop.controls);
    if (aop.angle != null && bop.angle != null) {
      expect(Math.abs(aop.angle - bop.angle)).toBeLessThan(0.001);
    } else {
      expect(aop.angle).toBe(bop.angle);
    }
  });
};

describe("circuitToQasm", () => {
  it("exports Bell exactly (header, registers, segment order)", () => {
    expect(circuitToQasm(bell)).toBe(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];\n',
    );
  });

  it("exports parameterized gates with 4 significant digits", () => {
    const c: Circuit = {
      numBits: 1,
      ops: [op(1, "Rx", 0, [0], [], 1.23456789)],
    };
    expect(circuitToQasm(c)).toContain("rx(1.235) q[0];");
  });

  it("exports C as cx and controls before targets", () => {
    const c: Circuit = { numBits: 3, ops: [op(1, "C", 4, [2], [0])] };
    expect(circuitToQasm(c)).toContain("cx q[0], q[2];");
  });

  it("exports swap and ccx with both/three args", () => {
    const c: Circuit = {
      numBits: 3,
      ops: [
        op(1, "SWAP", 0, [0, 2]),
        op(2, "CCX", 1, [2], [0, 1]),
      ],
    };
    const q = circuitToQasm(c);
    expect(q).toContain("swap q[0], q[2];");
    expect(q).toContain("ccx q[0], q[1], q[2];");
  });

  it("sorts statements by segment even when ops are out of order", () => {
    const c: Circuit = {
      numBits: 1,
      ops: [op(2, "X", 5, [0]), op(1, "H", 0, [0])],
    };
    const lines = circuitToQasm(c).trim().split("\n");
    // Header exports as two lines (version + include).
    expect(lines[4]).toBe("h q[0];");
    expect(lines[5]).toBe("x q[0];");
  });
});

describe("parseAngle", () => {
  it.each([
    ["pi", Math.PI],
    ["pi/2", Math.PI / 2],
    ["2*pi", 2 * Math.PI],
    ["3*pi/4", (3 * Math.PI) / 4],
    ["-pi/2", -Math.PI / 2],
    ["1.5708", 1.5708],
    ["0", 0],
  ])("parses %s", (expr, expected) => {
    expect(parseAngle(expr)).toBeCloseTo(expected, 6);
  });

  it("rejects malformed expressions", () => {
    expect(Number.isNaN(parseAngle("pi*"))).toBe(true);
    expect(Number.isNaN(parseAngle("foo"))).toBe(true);
  });
});

describe("qasmToCircuit", () => {
  /** Assert success and unwrap (throws with real errors on failure). */
  const asCircuit = (r: ReturnType<typeof qasmToCircuit>): Circuit => {
    if ("circuit" in r) return r.circuit;
    throw new Error(`expected circuit, got errors: ${r.errors.join("; ")}`);
  };
  const asErrors = (r: ReturnType<typeof qasmToCircuit>): string[] => {
    if ("errors" in r) return r.errors;
    throw new Error("expected errors, got a circuit");
  };

  it("round-trips Bell", () => {
    equivalent(asCircuit(qasmToCircuit(circuitToQasm(bell))), bell);
  });

  it("round-trips Rx with an odd angle", () => {
    const c: Circuit = { numBits: 1, ops: [op(1, "Rx", 0, [0], [], 0.9273)] };
    equivalent(asCircuit(qasmToCircuit(circuitToQasm(c))), c);
  });

  it("round-trips CCX preserving control order", () => {
    const c: Circuit = { numBits: 3, ops: [op(1, "CCX", 0, [2], [1, 0])] };
    equivalent(asCircuit(qasmToCircuit(circuitToQasm(c))), c);
  });

  it("round-trips SWAP", () => {
    const c: Circuit = { numBits: 3, ops: [op(1, "SWAP", 0, [2, 0])] };
    equivalent(asCircuit(qasmToCircuit(circuitToQasm(c))), c);
  });

  it("round-trips mixed M with Sdg/Tdg", () => {
    const c: Circuit = {
      numBits: 2,
      ops: [
        op(1, "Sdg", 0, [1]),
        op(2, "Tdg", 1, [0]),
        op(3, "M", 2, [0]),
      ],
    };
    equivalent(asCircuit(qasmToCircuit(circuitToQasm(c))), c);
  });

  it("accepts pi expressions on import", () => {
    const result = asCircuit(
      qasmToCircuit(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nrx(pi/2) q[0];',
      ),
    );
    expect(result.ops[0].angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("accepts u1 as P", () => {
    const result = asCircuit(
      qasmToCircuit(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nu1(3.1416) q[0];',
      ),
    );
    expect(result.ops[0].type).toBe("P");
  });

  it("skips barriers and comments silently", () => {
    const result = asCircuit(
      qasmToCircuit(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\n// a comment\nqreg q[2];\ncreg c[2];\n/* block\ncomment */\nh q[0];\nbarrier q[0], q[1];\ncx q[0], q[1];',
      ),
    );
    expect(result.ops).toHaveLength(2);
  });

  it("rejects unknown gates with a line number", () => {
    const errors = asErrors(
      qasmToCircuit(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nrzz(0.5) q[0], q[0];',
      ),
    );
    expect(errors[0]).toMatch(/line 5: unknown gate 'rzz'/);
  });

  it("rejects malformed statements with a line number", () => {
    const errors = asErrors(
      qasmToCircuit('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nh q'),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/^line \d+:/);
  });

  it("rejects circuits exceeding 10 time columns", () => {
    const stmts = Array.from({ length: 11 }, (_, i) => `x q[${i % 2}];`).join("\n");
    const errors = asErrors(
      qasmToCircuit(
        `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n${stmts}`,
      ),
    );
    expect(errors).toContain("circuit exceeds 10 time columns");
  });

  it("derives numBits from qreg, floored at max used index", () => {
    // qreg declares 4, only q[0] used → numBits stays 4.
    const four = asCircuit(
      qasmToCircuit('OPENQASM 2.0;\nqreg q[4];\ncreg c[4];\nh q[0];'),
    );
    expect(four.numBits).toBe(4);
    // qreg declares 2 but q[3] used → floored up to 4.
    const bumped = asCircuit(
      qasmToCircuit('OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\nh q[3];'),
    );
    expect(bumped.numBits).toBe(4);
  });

  it("rejects qubit indices above 15", () => {
    const errors = asErrors(
      qasmToCircuit('OPENQASM 2.0;\nqreg q[20];\ncreg c[20];\nh q[17];'),
    );
    expect(errors.some((e) => e.includes("out of range"))).toBe(true);
  });

  it("rejects a measure whose creg index mismatches", () => {
    const errors = asErrors(
      qasmToCircuit('OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\nmeasure q[0] -> c[1];'),
    );
    expect(errors.some((e) => e.includes("measure target must match"))).toBe(
      true,
    );
  });
});
