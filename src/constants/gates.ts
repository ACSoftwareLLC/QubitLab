import type { GateType, GateConfig } from '../types';
import { GATE_WIDTH } from './canvas';

const single = { category: 'single', targetCapacity: 1, controlCapacity: 0 } as const;

export const GATE_CONFIGS: Record<GateType, GateConfig> = {
  // Single-qubit
  H: {
    name: 'H',
    fullName: 'Hadamard',
    description: 'Creates an equal superposition of |0⟩ and |1⟩.',
    color: '#2196F3',
    symbol: 'H',
    ...single,
  },
  X: {
    name: 'X',
    fullName: 'Pauli-X',
    description: 'Quantum NOT gate: flips the state of a qubit.',
    color: '#F44336',
    symbol: 'X',
    ...single,
  },
  Y: {
    name: 'Y',
    fullName: 'Pauli-Y',
    description: 'Rotates the qubit state around the Y axis of the Bloch sphere.',
    color: '#9C27B0',
    symbol: 'Y',
    ...single,
  },
  Z: {
    name: 'Z',
    fullName: 'Pauli-Z',
    description: 'Flips the phase of the |1⟩ component.',
    color: '#FF9800',
    symbol: 'Z',
    ...single,
  },
  S: {
    name: 'S',
    fullName: 'S gate',
    description: 'Applies a 90° phase shift to |1⟩ (square root of Z).',
    color: '#4CAF50',
    symbol: 'S',
    ...single,
  },
  T: {
    name: 'T',
    fullName: 'T gate',
    description: 'Applies a 45° phase shift to |1⟩ (square root of S).',
    color: '#E91E63',
    symbol: 'T',
    ...single,
  },
  Sdg: {
    name: 'Sdg',
    fullName: 'S dagger',
    description: 'Inverse of the S gate: applies a −90° phase shift.',
    color: '#388E3C',
    symbol: 'S†',
    ...single,
  },
  Tdg: {
    name: 'Tdg',
    fullName: 'T dagger',
    description: 'Inverse of the T gate: applies a −45° phase shift.',
    color: '#AD1457',
    symbol: 'T†',
    ...single,
  },
  SX: {
    name: 'SX',
    fullName: 'Square-root X',
    description: 'Square root of the X gate; two in a row act like a NOT.',
    color: '#E53935',
    symbol: '√X',
    ...single,
  },
  I: {
    name: 'I',
    fullName: 'Identity',
    description: 'Leaves the qubit state unchanged.',
    color: '#607D8B',
    symbol: 'I',
    ...single,
  },

  // Parameterized rotations (angle in radians)
  Rx: {
    name: 'Rx',
    fullName: 'Rotation X',
    description: 'Rotates the qubit around the X axis by a given angle.',
    color: '#00897B',
    symbol: 'Rx',
    category: 'parameterized',
    defaultAngle: Math.PI / 2,
    targetCapacity: 1,
    controlCapacity: 0,
  },
  Ry: {
    name: 'Ry',
    fullName: 'Rotation Y',
    description: 'Rotates the qubit around the Y axis by a given angle.',
    color: '#00796B',
    symbol: 'Ry',
    category: 'parameterized',
    defaultAngle: Math.PI / 2,
    targetCapacity: 1,
    controlCapacity: 0,
  },
  Rz: {
    name: 'Rz',
    fullName: 'Rotation Z',
    description: 'Rotates the qubit around the Z axis by a given angle.',
    color: '#00695C',
    symbol: 'Rz',
    category: 'parameterized',
    defaultAngle: Math.PI / 2,
    targetCapacity: 1,
    controlCapacity: 0,
  },
  P: {
    name: 'P',
    fullName: 'Phase',
    description: 'Applies a phase rotation of the given angle to |1⟩.',
    color: '#26A69A',
    symbol: 'P',
    category: 'parameterized',
    defaultAngle: Math.PI / 2,
    targetCapacity: 1,
    controlCapacity: 0,
  },

  // Multi-qubit
  C: {
    name: 'C',
    fullName: 'Controlled-NOT',
    description: 'Alias for CX: flips the target qubit when the control is |1⟩.',
    color: '#9C27B0',
    symbol: 'C',
    category: 'multi',
    targetCapacity: 1,
    controlCapacity: 1,
  },
  CX: {
    name: 'CX',
    fullName: 'Controlled-X',
    description: 'Flips the target qubit when the control qubit is |1⟩.',
    color: '#7B1FA2',
    symbol: 'CX',
    category: 'multi',
    targetCapacity: 1,
    controlCapacity: 1,
  },
  CZ: {
    name: 'CZ',
    fullName: 'Controlled-Z',
    description: 'Applies a Z gate to the target when the control is |1⟩.',
    color: '#6A1B9A',
    symbol: 'CZ',
    category: 'multi',
    targetCapacity: 1,
    controlCapacity: 1,
  },
  CCX: {
    name: 'CCX',
    fullName: 'Toffoli',
    description: 'Flips the target qubit when both control qubits are |1⟩.',
    color: '#4A148C',
    symbol: 'CCX',
    category: 'multi',
    targetCapacity: 1,
    controlCapacity: 2,
  },
  SWAP: {
    name: 'SWAP',
    fullName: 'Swap',
    description: 'Exchanges the states of two qubits.',
    color: '#5E35B1',
    symbol: 'SW',
    category: 'multi',
    targetCapacity: 2,
    controlCapacity: 0,
  },

  // Measurement
  M: {
    name: 'M',
    fullName: 'Measure',
    description: 'Measures the qubit and collapses it to |0⟩ or |1⟩.',
    color: '#455A64',
    symbol: 'M',
    category: 'measure',
    targetCapacity: 1,
    controlCapacity: 0,
  },
};

/** Short unicode text forms of each gate's matrix — display-only (used
 *  by editor tooltips); not a computation source. θ is the gate angle. */
export const GATE_MATRICES: Record<GateType, string> = {
  // Single-qubit
  H: '1/√2 · [[1, 1], [1, −1]]',
  X: '[[0, 1], [1, 0]]',
  Y: '[[0, −i], [i, 0]]',
  Z: '[[1, 0], [0, −1]]',
  S: '[[1, 0], [0, i]]',
  T: '[[1, 0], [0, e^(iπ/4)]]',
  Sdg: '[[1, 0], [0, −i]]',
  Tdg: '[[1, 0], [0, e^(−iπ/4)]]',
  SX: '1/2 · [[1+i, 1−i], [1−i, 1+i]]',
  I: '[[1, 0], [0, 1]]',
  // Parameterized rotations
  Rx: '[[cos θ/2, −i sin θ/2], [−i sin θ/2, cos θ/2]]',
  Ry: '[[cos θ/2, −sin θ/2], [sin θ/2, cos θ/2]]',
  Rz: '[[e^(−iθ/2), 0], [0, e^(iθ/2)]]',
  P: '[[1, 0], [0, e^(iθ)]]',
  // Multi-qubit
  C: '4×4 — alias of CX (control-target)',
  CX: '4×4 — X on target when control is |1⟩',
  CZ: '4×4 — Z on target when control is |1⟩',
  CCX: '8×8 — X when both controls are |1⟩',
  SWAP: '4×4 — swaps the two target qubits',
  // Measurement
  M: 'collapse to |0⟩/|1⟩',
};

export const GATE_CATEGORIES: { key: GateConfig['category']; label: string; color: string }[] = [
  { key: 'single', label: 'Single-bit Gates', color: '#FFEB3B' },
  { key: 'parameterized', label: 'Parameterized', color: '#4DB6AC' },
  { key: 'multi', label: 'Multi-bit Gates', color: '#FF9800' },
  { key: 'measure', label: 'Measurement', color: '#90A4AE' },
];

export type GateOrigin = {
  index: number;
  offsetX: number; // local x offset within the gate block
  role: 'target' | 'control';
};

/** Line-origin dots along a gate's bottom edge: one per connection the gate
 *  accepts, targets first (left), then controls. */
export const getGateOrigins = (config: GateConfig, gateWidth: number): GateOrigin[] => {
  const count = config.targetCapacity + config.controlCapacity;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    offsetX: (gateWidth * (i + 1)) / (count + 1),
    role: i < config.targetCapacity ? 'target' : 'control',
  }));
};

/** Gate block width is the default size multiplied by the number of line
 *  origins the gate has, so multi-input gates aren't squished. Single-origin
 *  gates keep the standard width (origins = 1). */
export const getGateWidth = (config: GateConfig): number => {
  const origins = config.targetCapacity + config.controlCapacity;
  return GATE_WIDTH * origins;
};
