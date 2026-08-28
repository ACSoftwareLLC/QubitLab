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
];
