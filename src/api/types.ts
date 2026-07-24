// TS mirrors of the API contract in docs/api.md.

export type GateOp = {
  id: number;
  type: string;
  segment: number;
  targets: number[];
  controls: number[];
  angle: number | null;
};

export type Circuit = {
  numBits: number;
  ops: GateOp[];
};

export type ValidationError = {
  opId: number | null;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export type StatevectorEntry = {
  basis: string;
  re: number;
  im: number;
  prob: number;
};

export type Snapshot = {
  segment: number;
  statevector: StatevectorEntry[];
  measurements: Record<string, 0 | 1>;
};

export type HealthResponse = {
  status: string;
  engine: string;
};

// WebSocket protocol (client → server)
export type WsClientMessage =
  | { type: 'start'; circuit: Circuit }
  | { type: 'step' }
  | { type: 'run' }
  | { type: 'peek'; segment: number }
  | { type: 'reset' };

// WebSocket protocol (server → client)
export type WsServerMessage =
  | ({ type: 'ready' } & { numSteps: number })
  | ({ type: 'state' } & Snapshot)
  | { type: 'done' }
  | { type: 'error'; message: string };
