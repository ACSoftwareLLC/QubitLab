import type { Circuit } from "../../api/types";

/** One-click starter circuits for the editor's empty state. Wire indices
 *  follow the grid model (qubit 0 topmost); segments are the 0..9 time
 *  columns. Ids are arbitrary but unique so loadCircuit and measurements
 *  keying don't collide. */
export type ExampleCircuit = {
  key: string;
  title: string;
  blurb: string;
  circuit: Circuit;
};

export const EXAMPLE_CIRCUITS: ExampleCircuit[] = [
  {
    key: "bell",
    title: "Bell pair",
    blurb: "Hadamard + CNOT — the classic two-qubit entangled pair",
    circuit: {
      numBits: 2,
      ops: [
        { id: 1, type: "H", segment: 0, targets: [0], controls: [], angle: null },
        { id: 2, type: "CX", segment: 1, targets: [1], controls: [0], angle: null },
      ],
    },
  },
  {
    key: "ghz3",
    title: "GHZ-3",
    blurb: "Three qubits entangled into the GHZ state",
    circuit: {
      numBits: 3,
      ops: [
        { id: 1, type: "H", segment: 0, targets: [0], controls: [], angle: null },
        { id: 2, type: "CX", segment: 1, targets: [1], controls: [0], angle: null },
        { id: 3, type: "CX", segment: 2, targets: [2], controls: [0], angle: null },
      ],
    },
  },
  {
    key: "coin-flips",
    title: "Coin flips",
    blurb: "Three independent superpositions, then measured",
    circuit: {
      numBits: 3,
      ops: [
        { id: 1, type: "H", segment: 0, targets: [0], controls: [], angle: null },
        { id: 2, type: "H", segment: 1, targets: [1], controls: [], angle: null },
        { id: 3, type: "H", segment: 2, targets: [2], controls: [], angle: null },
        { id: 4, type: "M", segment: 3, targets: [0], controls: [], angle: null },
        { id: 5, type: "M", segment: 3, targets: [1], controls: [], angle: null },
        { id: 6, type: "M", segment: 3, targets: [2], controls: [], angle: null },
      ],
    },
  },
  {
    key: "teleportation",
    title: "Teleportation",
    blurb: "Standard quantum teleportation protocol with two measurements",
    circuit: {
      numBits: 3,
      ops: [
        { id: 1, type: "H", segment: 0, targets: [1], controls: [], angle: null },
        { id: 2, type: "CX", segment: 1, targets: [2], controls: [1], angle: null },
        { id: 3, type: "CX", segment: 2, targets: [1], controls: [0], angle: null },
        { id: 4, type: "H", segment: 3, targets: [0], controls: [], angle: null },
        { id: 5, type: "M", segment: 4, targets: [0], controls: [], angle: null },
        { id: 6, type: "M", segment: 5, targets: [1], controls: [], angle: null },
      ],
    },
  },
  {
    key: "half-adder",
    title: "Half adder",
    blurb: "Sum + carry via CNOT and Toffoli — the classical building block",
    circuit: {
      numBits: 3,
      ops: [
        // Wires: a=0, b=1, sum=2. sum = a⊕b, carry = a·b.
        { id: 1, type: "CCX", segment: 0, targets: [2], controls: [0, 1], angle: null },
        { id: 2, type: "CX", segment: 1, targets: [2], controls: [0], angle: null },
        { id: 3, type: "CX", segment: 2, targets: [2], controls: [1], angle: null },
        { id: 4, type: "M", segment: 3, targets: [0], controls: [], angle: null },
        { id: 5, type: "M", segment: 3, targets: [1], controls: [], angle: null },
        { id: 6, type: "M", segment: 3, targets: [2], controls: [], angle: null },
      ],
    },
  },
  {
    key: "cuccaro-add1",
    title: "Cuccaro adder (1-bit)",
    blurb: "Ripple-carry adder, Cuccaro et al. quant-ph/0410184 — majority, carry, un-majority",
    circuit: {
      // a=0, b=1, cin=2, cout=3. Computes a+b with the MAJ–carrying–UMA
      // sequence; the 4-bit original needs more time columns than this
      // editor's grid has, so this is the 1-bit core.
      numBits: 4,
      ops: [
        // majority(cin, b, a): cx b,a; cx cin,a; ccx a,b→cin
        { id: 1, type: "CX", segment: 0, targets: [0], controls: [1], angle: null },
        { id: 2, type: "CX", segment: 1, targets: [0], controls: [2], angle: null },
        { id: 3, type: "CCX", segment: 2, targets: [2], controls: [0, 1], angle: null },
        // carry: cx a→cout
        { id: 4, type: "CX", segment: 3, targets: [3], controls: [0], angle: null },
        // unmaj = majority† : ccx a,b→cin; cx cin,a; cx b,a
        { id: 5, type: "CCX", segment: 4, targets: [2], controls: [0, 1], angle: null },
        { id: 6, type: "CX", segment: 5, targets: [0], controls: [2], angle: null },
        { id: 7, type: "CX", segment: 6, targets: [0], controls: [1], angle: null },
        // read the sum bit (b) and the carry (cout)
        { id: 8, type: "M", segment: 7, targets: [1], controls: [], angle: null },
        { id: 9, type: "M", segment: 7, targets: [3], controls: [], angle: null },
      ],
    },
  },
];
