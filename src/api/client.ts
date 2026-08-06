import type { Circuit, HealthResponse, Snapshot, ValidationResult } from './types';
import { simulate, validate } from './wasm';

// Simulation now runs locally in the Rust/WASM engine (see wasm.ts), so these
// keep their old network-API signatures but resolve without any backend.

export const apiHealth = (): Promise<HealthResponse> =>
  Promise.resolve({ status: 'ok', engine: 'rust-wasm' });

export const validateCircuit = (circuit: Circuit): Promise<ValidationResult> =>
  validate(circuit);

export const simulateCircuit = (
  circuit: Circuit,
  throughSegment: number | null = null,
): Promise<Snapshot> => simulate(circuit, throughSegment);
