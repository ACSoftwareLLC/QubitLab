# Quantum-Dnd simulation stub

FastAPI backend implementing the contract in `../docs/api.md`. Simulation
is a naive numpy statevector engine (`simulator.py`) — that module is the
single swap point for qiskit (`qiskit.Aer`) later; routes won't change.

## Setup

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The Vite dev server proxies `/api` and `/ws` here, so no CORS or URL
config is needed on the frontend.

## Smoke test

```bash
curl localhost:8000/api/health
curl -X POST localhost:8000/api/simulate \
  -H 'Content-Type: application/json' \
  -d '{"circuit": {"numBits": 2, "ops": [
        {"id": 1, "type": "H",  "segment": 0, "targets": [0], "controls": [], "angle": null},
        {"id": 2, "type": "CX", "segment": 1, "targets": [1], "controls": [0], "angle": null}
      ]}}'
# → 50/50 |00⟩ and |11⟩
```
