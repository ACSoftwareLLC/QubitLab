import init, { WasmSession, simulateCircuit as wasmSimulate, validateCircuit as wasmValidate } from '../wasm/pkg/quantum_dnd_simulator';
import type { Circuit, Snapshot, ValidationError, ValidationResult } from './types';

/**
 * Typed wrapper over the Rust/WASM simulator (see simulator/ at the repo
 * root, built into src/wasm/pkg via `npm run build:wasm`).
 *
 * The WASM module is initialized lazily on first use; every call awaits the
 * same one-time init promise so callers never see a race. Payloads cross the
 * WASM boundary as JSON strings, so the shapes in ./types.ts are preserved
 * exactly (previously these came from the FastAPI backend over HTTP/WS).
 */

let ready: Promise<unknown> | null = null;

function wasmReady(): Promise<unknown> {
  if (!ready) ready = init();
  return ready;
}

export async function validate(circuit: Circuit): Promise<ValidationResult> {
  await wasmReady();
  return JSON.parse(wasmValidate(JSON.stringify(circuit))) as ValidationResult;
}

export async function simulate(
  circuit: Circuit,
  throughSegment: number | null = null,
): Promise<Snapshot> {
  await wasmReady();
  const result = JSON.parse(
    wasmSimulate(JSON.stringify(circuit), throughSegment ?? undefined),
  ) as { ok?: Snapshot; errors?: ValidationError[] };
  if (result.errors) {
    // Mirrors the old backend's 422 payload, which postJson surfaced as-is.
    return { valid: false, errors: result.errors } as unknown as Snapshot;
  }
  return result.ok as Snapshot;
}

/** Local equivalent of the old /ws/simulate session (one StepSession in WASM). */
export class LocalSession {
  private inner: WasmSession;

  private constructor(inner: WasmSession) {
    this.inner = inner;
  }

  /** Throws an Error whose message is the JSON-encoded validation-error list. */
  static async create(circuit: Circuit): Promise<LocalSession> {
    await wasmReady();
    try {
      return new LocalSession(new WasmSession(JSON.stringify(circuit)));
    } catch (e) {
      throw new Error(typeof e === 'string' ? e : String(e));
    }
  }

  get numSteps(): number {
    return this.inner.numSteps;
  }

  step(): Snapshot | null {
    const result = this.inner.step() as string | null;
    return result === null ? null : (JSON.parse(result) as Snapshot);
  }

  run(): Snapshot {
    return JSON.parse(this.inner.run()) as Snapshot;
  }

  reset(): Snapshot {
    return JSON.parse(this.inner.reset()) as Snapshot;
  }

  peek(segment: number): Snapshot {
    return JSON.parse(this.inner.peek(segment)) as Snapshot;
  }

  snapshot(): Snapshot {
    return JSON.parse(this.inner.snapshot()) as Snapshot;
  }
}
