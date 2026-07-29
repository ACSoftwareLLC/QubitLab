import type { GateType, GateConfig } from '../types';
import { GATE_WIDTH } from './canvas';

const single = { category: 'single', targetCapacity: 1, controlCapacity: 0 } as const;

export const GATE_CONFIGS: Record<GateType, GateConfig> = {
  // Single-qubit
  H: { name: 'H', color: '#2196F3', symbol: 'H', ...single },
  X: { name: 'X', color: '#F44336', symbol: 'X', ...single },
  Y: { name: 'Y', color: '#9C27B0', symbol: 'Y', ...single },
  Z: { name: 'Z', color: '#FF9800', symbol: 'Z', ...single },
  S: { name: 'S', color: '#4CAF50', symbol: 'S', ...single },
  T: { name: 'T', color: '#E91E63', symbol: 'T', ...single },
  Sdg: { name: 'Sdg', color: '#388E3C', symbol: 'S†', ...single },
  Tdg: { name: 'Tdg', color: '#AD1457', symbol: 'T†', ...single },
  SX: { name: 'SX', color: '#E53935', symbol: '√X', ...single },
  I: { name: 'I', color: '#607D8B', symbol: 'I', ...single },

  // Parameterized rotations (angle in radians)
  Rx: { name: 'Rx', color: '#00897B', symbol: 'Rx', category: 'parameterized', defaultAngle: Math.PI / 2, targetCapacity: 1, controlCapacity: 0 },
  Ry: { name: 'Ry', color: '#00796B', symbol: 'Ry', category: 'parameterized', defaultAngle: Math.PI / 2, targetCapacity: 1, controlCapacity: 0 },
  Rz: { name: 'Rz', color: '#00695C', symbol: 'Rz', category: 'parameterized', defaultAngle: Math.PI / 2, targetCapacity: 1, controlCapacity: 0 },
  P: { name: 'P', color: '#26A69A', symbol: 'P', category: 'parameterized', defaultAngle: Math.PI / 2, targetCapacity: 1, controlCapacity: 0 },

  // Multi-qubit
  C: { name: 'C', color: '#9C27B0', symbol: 'C', category: 'multi', targetCapacity: 1, controlCapacity: 1 },
  CX: { name: 'CX', color: '#7B1FA2', symbol: 'CX', category: 'multi', targetCapacity: 1, controlCapacity: 1 },
  CZ: { name: 'CZ', color: '#6A1B9A', symbol: 'CZ', category: 'multi', targetCapacity: 1, controlCapacity: 1 },
  CCX: { name: 'CCX', color: '#4A148C', symbol: 'CCX', category: 'multi', targetCapacity: 1, controlCapacity: 2 },
  SWAP: { name: 'SWAP', color: '#5E35B1', symbol: 'SW', category: 'multi', targetCapacity: 2, controlCapacity: 0 },

  // Measurement
  M: { name: 'M', color: '#455A64', symbol: 'M', category: 'measure', targetCapacity: 1, controlCapacity: 0 },
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
