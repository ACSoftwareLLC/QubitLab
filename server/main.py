"""FastAPI stub for the Quantum-Dnd simulation backend.

Route surface is stable (see docs/api.md); the simulation logic lives in
simulator.py, which is the swap point for qiskit later.

Run:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from simulator import StepSession, simulate, validate

app = FastAPI(title="Quantum-Dnd simulation stub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "engine": "qiskit"}


@app.post("/api/validate")
def validate_circuit(circuit: dict) -> dict:
    errors = validate(circuit)
    return {"valid": not errors, "errors": errors}


@app.post("/api/simulate")
def simulate_circuit(body: dict):
    circuit = body.get("circuit") or {}
    through_segment = body.get("throughSegment")
    try:
        return simulate(circuit, through_segment=through_segment)
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"valid": False, "errors": exc.args[0]})


@app.websocket("/ws/simulate")
async def ws_simulate(ws: WebSocket) -> None:
    await ws.accept()
    session: StepSession | None = None
    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type == "start":
                try:
                    session = StepSession(msg.get("circuit") or {})
                except ValueError as exc:
                    await ws.send_json({"type": "error", "message": f"invalid circuit: {exc.args[0]}"})
                    continue
                await ws.send_json({"type": "ready", "numSteps": session.num_steps})

            elif session is None:
                await ws.send_json({"type": "error", "message": "no circuit loaded — send start first"})

            elif msg_type == "step":
                snapshot = session.step()
                if snapshot is None:
                    await ws.send_json({"type": "done"})
                else:
                    await ws.send_json({"type": "state", **snapshot})

            elif msg_type == "run":
                await ws.send_json({"type": "state", **session.run()})
                await ws.send_json({"type": "done"})

            elif msg_type == "peek":
                segment = msg.get("segment")
                if not isinstance(segment, int):
                    await ws.send_json({"type": "error", "message": "peek requires an integer segment"})
                    continue
                await ws.send_json({"type": "state", **session.peek(segment)})

            elif msg_type == "reset":
                await ws.send_json({"type": "state", **session.reset()})

            else:
                await ws.send_json({"type": "error", "message": f"unknown message type {msg_type!r}"})
    except WebSocketDisconnect:
        pass
