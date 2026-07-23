import type { GateType, GateConfig } from '../types';

export const GATE_CONFIGS: Record<GateType, GateConfig> = {
  H: { name: 'H', color: '#2196F3', symbol: 'H' },
  X: { name: 'X', color: '#F44336', symbol: 'X' },
  Y: { name: 'Y', color: '#9C27B0', symbol: 'Y' },
  Z: { name: 'Z', color: '#FF9800', symbol: 'Z' },
  S: { name: 'S', color: '#4CAF50', symbol: 'S' },
  T: { name: 'T', color: '#E91E63', symbol: 'T' },
  C: { name: 'C', color: '#9C27B0', symbol: 'C' },
};
