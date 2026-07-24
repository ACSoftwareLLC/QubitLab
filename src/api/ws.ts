import type { Circuit, WsClientMessage, WsServerMessage } from './types';

/**
 * WebSocket stepping session for /ws/simulate (see docs/api.md).
 *
 * The protocol is strictly request → response, so each call awaits the
 * next server frame. Calls are serialized on an internal promise chain —
 * safe to fire from UI handlers without locking.
 */
export class SimulationSession {
  private ws: WebSocket | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private pending: {
    resolve: (msg: WsServerMessage) => void;
    reject: (err: Error) => void;
  }[] = [];

  /** Resolves once the socket is open; rejects if it fails to connect. */
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws/simulate`);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('simulation server unreachable'));
      ws.onclose = () => {
        this.ws = null;
        const err = new Error('simulation session closed');
        this.pending.forEach(p => p.reject(err));
        this.pending = [];
      };
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data) as WsServerMessage;
        this.pending.shift()?.resolve(msg);
      };
    });
  }

  private request(msg: WsClientMessage): Promise<WsServerMessage> {
    const run = () =>
      new Promise<WsServerMessage>((resolve, reject) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          reject(new Error('not connected'));
          return;
        }
        this.pending.push({ resolve, reject });
        this.ws.send(JSON.stringify(msg));
      });
    const result = this.chain.then(run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  start(circuit: Circuit) {
    return this.request({ type: 'start', circuit });
  }

  step() {
    return this.request({ type: 'step' });
  }

  /** Server replies `state` then `done`; resolves with the final state. */
  async run() {
    const state = await this.request({ type: 'run' });
    if (state.type === 'state') {
      // drain the trailing `done` frame
      await this.nextFrame().catch(() => undefined);
    }
    return state;
  }

  peek(segment: number) {
    return this.request({ type: 'peek', segment });
  }

  reset() {
    return this.request({ type: 'reset' });
  }

  private nextFrame(): Promise<WsServerMessage> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
