import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasGate, GateLine } from '../types';
import { serializeCircuit } from '../api/serialize';
import { simulateCircuit, validateCircuit } from '../api/client';
import { SimulationSession } from '../api/ws';
import type { Snapshot, ValidationError } from '../api/types';

export type SimStatus = 'idle' | 'ready' | 'running' | 'done' | 'invalid' | 'offline';

export type Simulation = ReturnType<typeof useSimulation>;

/**
 * Execution state for the canvas circuit, backed by the local WASM simulator
 * (docs/api.md). A stateful stepping session is preferred; falls back to
 * per-step one-shot simulation when the session can't be created.
 */
export function useSimulation(gates: CanvasGate[], gateLines: GateLine[], numBits: number) {
  const { circuit, unconnectedGateIds } = useMemo(
    () => serializeCircuit(gates, gateLines, numBits),
    [gates, gateLines, numBits],
  );

  const [status, setStatus] = useState<SimStatus>('idle');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [peekSnapshot, setPeekSnapshot] = useState<Snapshot | null>(null);
  const [snapshotHistory, setSnapshotHistory] = useState<Snapshot[]>([]);
  const [numSteps, setNumSteps] = useState(0);
  const sessionRef = useRef<SimulationSession | null>(null);

  const segments = useMemo(
    () => [...new Set(circuit.ops.map(op => op.segment))].sort((a, b) => a - b),
    [circuit],
  );

  // Any circuit edit invalidates the running session: reset state during
  // render (React's "adjusting state when inputs change" pattern)…
  const [sessionCircuit, setSessionCircuit] = useState(circuit);
  if (sessionCircuit !== circuit) {
    setSessionCircuit(circuit);
    setStatus('idle');
    setSnapshot(null);
    setPeekSnapshot(null);
    setSnapshotHistory([]);
    setErrors([]);
  }

  // …and tear down the socket in an effect (external system).
  useEffect(() => {
    if (sessionCircuit !== circuit) {
      sessionRef.current?.close();
      sessionRef.current = null;
    }
  }, [circuit, sessionCircuit]);

  const start = useCallback(async () => {
    const validation = await validateCircuit(circuit).catch(() => null);
    if (!validation) {
      setStatus('offline');
      return;
    }
    if (!validation.valid) {
      setErrors(validation.errors);
      setStatus('invalid');
      return;
    }
    setErrors([]);

    const session = new SimulationSession();
    try {
      await session.connect();
      const reply = await session.start(circuit);
      if (reply.type === 'ready') {
        sessionRef.current = session;
        setNumSteps(reply.numSteps);
        setStatus('ready');
        setSnapshot(null);
        setPeekSnapshot(null);
        setSnapshotHistory([]);
        return;
      }
      if (reply.type === 'error') {
        setErrors([{ opId: null, message: reply.message }]);
        setStatus('invalid');
        return;
      }
    } catch {
      // fall through to stateless mode
    }
    // Stateless fallback: no persistent session, step via one-shot simulate.
    sessionRef.current = null;
    setNumSteps(segments.length);
    setStatus('ready');
    setSnapshot(null);
    setPeekSnapshot(null);
    setSnapshotHistory([]);
  }, [circuit, segments]);

  const step = useCallback(async () => {
    if (status !== 'ready' && status !== 'running') return;
    const session = sessionRef.current;

      if (session) {
      const reply = await session.step().catch(() => null);
      if (!reply) {
        setStatus('offline');
      } else if (reply.type === 'state') {
        setSnapshot(reply);
        setSnapshotHistory(prev =>
          prev.length > 0 && prev[prev.length - 1].segment === reply.segment
            ? prev
            : [...prev, reply],
        );
        setStatus('running');
      } else if (reply.type === 'done') {
        setStatus('done');
      }
      return;
    }

    // Stateless fallback
    const current = snapshot?.segment ?? -1;
    const next = segments.find(s => s > current);
    if (next == null) {
      setStatus('done');
      return;
    }
    const snap = await simulateCircuit(circuit, next).catch(() => null);
    if (!snap) {
      setStatus('offline');
      return;
    }
    setSnapshot(snap);
    setSnapshotHistory(prev =>
      prev.length > 0 && prev[prev.length - 1].segment === snap.segment
        ? prev
        : [...prev, snap],
    );
    setStatus(segments.some(s => s > next) ? 'running' : 'done');
  }, [circuit, segments, snapshot, status]);

  const run = useCallback(async () => {
    if (status !== 'ready' && status !== 'running') return;
    const session = sessionRef.current;

    if (session) {
      const reply = await session.run().catch(() => null);
      if (!reply) {
        setStatus('offline');
      } else if (reply.type === 'state') {
        setSnapshot(reply);
        setSnapshotHistory(prev =>
          prev.length > 0 && prev[prev.length - 1].segment === reply.segment
            ? prev
            : [...prev, reply],
        );
        setStatus('done');
      }
      return;
    }

    const snap = await simulateCircuit(circuit, null).catch(() => null);
    if (!snap) {
      setStatus('offline');
      return;
    }
    setSnapshot(snap);
    setSnapshotHistory(prev =>
      prev.length > 0 && prev[prev.length - 1].segment === snap.segment
        ? prev
        : [...prev, snap],
    );
    setStatus('done');
  }, [circuit, status]);

  const reset = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      const reply = await session.reset().catch(() => null);
      if (reply?.type === 'state') {
        setSnapshot(null);
        setStatus('ready');
      }
    } else {
      setSnapshot(null);
      if (status !== 'offline') setStatus('ready');
    }
    setPeekSnapshot(null);
    setSnapshotHistory([]);
  }, [status]);

  const peek = useCallback(
    async (segment: number) => {
      const session = sessionRef.current;
      if (session) {
        const reply = await session.peek(segment).catch(() => null);
        if (reply?.type === 'state') setPeekSnapshot(reply);
        return;
      }
      const snap = await simulateCircuit(circuit, segment).catch(() => null);
      if (snap) setPeekSnapshot(snap);
    },
    [circuit],
  );

  const clearPeek = useCallback(() => setPeekSnapshot(null), []);

  return {
    status,
    errors,
    snapshot,
    peekSnapshot,
    snapshotHistory,
    numSteps,
    currentSegment: snapshot?.segment ?? -1,
    unconnectedGateIds,
    start,
    step,
    run,
    reset,
    peek,
    clearPeek,
  };
}
