# Quantum-Dnd Simulation API

Contract between the React frontend and the simulation engine. The engine is a
Rust crate (`simulator/`) compiled to WASM and executed **in the browser** —
there is no simulation backend. It is a drop-in port of the former
FastAPI/Qiskit service: payload shapes and behavior are unchanged, only the
transport (HTTP/WebSocket) is gone.

Build the WASM bundle once after cloning and after any change to `simulator/`:

```bash
npm run build:wasm   # wasm-pack build simulator --target web --out-dir ../src/wasm/pkg --release
```

The TypeScript facade lives in `src/api/wasm.ts`; `src/api/client.ts`
(one-shot validate/simulate) and `src/api/ws.ts` (stepping sessions) expose
the same signatures the network client had.

---

## 1. Circuit JSON

The payload produced by the frontend serializer (`src/api/serialize.ts`)
and accepted by every entry point that runs or checks a circuit.

```json
{
  "numBits": 4,
  "ops": [
    {
      "id": 1721300000000,
      "type": "CX",
      "segment": 2,
      "targets": [1],
      "controls": [0],
      "angle": null
    }
  ]
}
```

| Field      | Type            | Notes                                                        |
|------------|-----------------|--------------------------------------------------------------|
| `numBits`  | int (1–16)      | Number of qubit wires.                                       |
| `ops`      | GateOp[]        | May be empty. Order irrelevant — execution sorts by segment. |
| `id`       | int             | Canvas gate id; echoed back in errors and measurements.      |
| `type`     | string          | One of the gate types below.                                 |
| `segment`  | int (0–9)       | Time column on the canvas. Ops in one segment commute.       |
| `targets`  | int[]           | Bit indices the gate acts on.                                |
| `controls` | int[]           | Bit indices conditioning the gate (may be empty).            |
| `angle`    | float \| null   | Radians. Required for `Rx/Ry/Rz/P`, ignored otherwise.       |

### Gate types

| Type   | Arity                    | angle | Notes                          |
|--------|--------------------------|-------|--------------------------------|
| `H` `X` `Y` `Z` `S` `T` `Sdg` `Tdg` `SX` `I` | 1 target | no  | Single-qubit.        |
| `Rx` `Ry` `Rz` `P` | 1 target            | yes   | Parameterized rotations.       |
| `C` `CX` `CZ`     | 1 control + 1 target     | no    | `C` is an alias of `CX`.       |
| `CCX`             | 2 controls + 1 target    | no    | Toffoli.                       |
| `SWAP`            | 2 targets, no controls   | no    |                                |
| `M`               | 1 target                 | no    | Measurement; collapses state.  |

Any gate may also be expressed as `controls: [...]` + single-qubit type;
the engine applies it controlled on all listed controls.

---

## 2. One-shot API (`src/api/client.ts` → `src/api/wasm.ts`)

### `apiHealth(): Promise<{ status: string; engine: string }>`

Resolves locally with `{ status: "ok", engine: "rust-wasm" }`.

### `validateCircuit(circuit): Promise<ValidationResult>`

Structural problems without simulating:

```json
{
  "valid": false,
  "errors": [
    { "opId": 1721300000000, "message": "CX requires exactly 1 target and 1 control" },
    { "opId": null,          "message": "circuit-wide problem" }
  ]
}
```

### `simulateCircuit(circuit, throughSegment?): Promise<Snapshot>`

`throughSegment` (optional, int 0–9 or null): execute only segments
`<= throughSegment`. Null/absent = full circuit.

Response:

```json
{
  "statevector": [
    { "basis": "00", "re": 0.7071, "im": 0.0, "prob": 0.5 },
    { "basis": "11", "re": 0.7071, "im": 0.0, "prob": 0.5 }
  ],
  "measurements": { "1721300000000": 1 }
}
```

- `statevector` is **sparse**: entries with `prob < 1e-6` are omitted.
- `basis` is a bit string, qubit 0 leftmost (`basis[i]` = bit on wire i).
- `measurements` maps measurement-gate id → classical outcome (0/1).
- Invalid circuit → resolves with `{ "valid": false, "errors": [...] }`
  (the shape the old backend's HTTP 422 carried).

---

## 3. Stepping sessions (`src/api/ws.ts`)

`SimulationSession` keeps the old WebSocket client's public API and message
shapes, but drives a local WASM `StepSession`. `connect()` resolves
immediately. One session per instance.

### Methods and resolved messages

| Method                              | Effect                                                        |
|-------------------------------------|---------------------------------------------------------------|
| `start(circuit)`                    | Load circuit, reset to segment −1, resolve `ready`.           |
| `step()`                            | Execute next segment, resolve `state` (or `done` at the end). |
| `run()`                             | Execute to the end, resolve final `state`.                    |
| `peek(segment)`                     | Resolve `state` as of that segment **without** moving the cursor. |
| `reset()`                           | Back to segment −1, resolve `state` for the initial state.    |

```json
{ "type": "ready", "numSteps": 4 }
```

```json
{
  "type": "state",
  "segment": 2,
  "statevector": [ { "basis": "00", "re": 0.7071, "im": 0.0, "prob": 0.5 } ],
  "measurements": {}
}
```

`segment` is the last executed segment (−1 = initial state).
`statevector`/`measurements` follow the one-shot shapes above.

```json
{ "type": "done" }
{ "type": "error", "message": "no circuit loaded — send start first" }
```

### Session rules

- `step` past the last segment resolves `done` (cursor unchanged).
- `peek` never changes the cursor; consecutive peeks are cheap.
- Calling `start` re-initializes the session at any time.
- Measurement outcomes are sampled per-session; `reset` re-rolls on the
  next pass.

---

## 4. Engine internals (`simulator/`)

Pure-Rust core (`cargo test` runs the full suite natively) plus a
wasm-bindgen facade. Statevector of `2^numBits` complex amplitudes; gates are
applied directly to the statevector (no materialized unitary), so per-gate
cost is O(2^n). Internal indices are little-endian: API wire `i` maps to bit
`numBits - 1 - i`, which is why basis strings print qubit 0 leftmost.
Measurement sampling uses OS/browser entropy (`getrandom` via
`crypto.getRandomValues`); the Rust test suite seeds its own RNG for
determinism.
