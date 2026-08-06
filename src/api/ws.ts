import type { Circuit, WsServerMessage } from './types';
import { LocalSession } from './wasm';

/**
 * Stepping session with the exact public API of the old WebSocket client
 * (docs/api.md), but driven by a local WASM `StepSession` — no socket, no
 * backend. Message shapes are preserved so callers (useSimulation) are
 * unaffected.
 */
export class SimulationSession {
  private session: LocalSession | null = null;

  /** Kept for interface compatibility; the local engine needs no connection. */
  connect(): Promise<void> {
    return Promise.resolve();
  }

  async start(circuit: Circuit): Promise<WsServerMessage> {
    try {
      this.session = await LocalSession.create(circuit);
    } catch (e) {
      return {
        type: 'error',
        message: `invalid circuit: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    return { type: 'ready', numSteps: this.session.numSteps };
  }

  step(): Promise<WsServerMessage> {
    if (!this.session) return this.noCircuit();
    const snapshot = this.session.step();
    return Promise.resolve(
      snapshot ? { type: 'state', ...snapshot } : { type: 'done' },
    );
  }

  /** Resolves with the final state (the old protocol's trailing `done` no longer exists). */
  run(): Promise<WsServerMessage> {
    if (!this.session) return this.noCircuit();
    return Promise.resolve({ type: 'state', ...this.session.run() });
  }

  peek(segment: number): Promise<WsServerMessage> {
    if (!this.session) return this.noCircuit();
    return Promise.resolve({ type: 'state', ...this.session.peek(segment) });
  }

  reset(): Promise<WsServerMessage> {
    if (!this.session) return this.noCircuit();
    return Promise.resolve({ type: 'state', ...this.session.reset() });
  }

  close() {
    this.session = null;
  }

  private noCircuit(): Promise<WsServerMessage> {
    return Promise.resolve({
      type: 'error',
      message: 'no circuit loaded — send start first',
    });
  }
}
