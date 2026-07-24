# Quantum-Dnd Simulation API

Contract between the React frontend and the Python simulation backend.
The backend is currently a FastAPI stub with a naive numpy simulator;
the route surface and payloads below are stable and will be backed by
qiskit later without changes.

Base URL: same origin in dev (Vite proxies `/api` and `/ws` to
`localhost:8000`).

---

## 1. Circuit JSON

The payload produced by the frontend serializer (`src/api/serialize.ts`)
and accepted by every endpoint that runs or checks a circuit.

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
the backend applies it controlled on all listed controls.

---

## 2. REST endpoints

### `GET /api/health`

```json
{ "status": "ok", "engine": "stub" }
```

### `POST /api/validate`

Body: a circuit. Returns structural problems without simulating.

```json
{
  "valid": false,
  "errors": [
    { "opId": 1721300000000, "message": "CX requires exactly 1 target and 1 control" },
    { "opId": null,          "message": "circuit-wide problem" }
  ]
}
```

### `POST /api/simulate`

One-shot simulation.

```json
{ "circuit": { "...": "..." }, "throughSegment": 3 }
```

`throughSegment` (optional, int 0–9 or null): execute only segments
`<= throughSegment`. Null/absent = full circuit.

Response `200`:

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
- Invalid circuit → `422` with the same body shape as `/api/validate`.

---

## 3. WebSocket `/ws/simulate`

One interactive stepping session per connection. JSON text frames both ways.

### Client → server

| Message                              | Effect                                             |
|--------------------------------------|----------------------------------------------------|
| `{ "type": "start", "circuit": {...} }` | Load circuit, reset to segment −1, reply `ready`. |
| `{ "type": "step" }`                 | Execute next segment, reply `state`.               |
| `{ "type": "run" }`                  | Execute to the end, reply `state` then `done`.     |
| `{ "type": "peek", "segment": 2 }`   | Reply `state` as of that segment **without** moving the cursor. |
| `{ "type": "reset" }`                | Back to segment −1, reply `state` for the initial state. |

### Server → client

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
`statevector`/`measurements` follow the REST shapes above.

```json
{ "type": "done" }
{ "type": "error", "message": "no circuit loaded — send start first" }
```

### Session rules

- `step` past the last segment replies `done` (cursor unchanged).
- `peek` never changes the cursor; consecutive peeks are cheap.
- Sending `start` re-initializes the session at any time.
- Measurement outcomes are sampled per-session; `reset` re-rolls on the
  next pass.
