"""Qiskit statevector simulator backend for Quantum-Dnd.

Replaces the naive numpy implementation with qiskit.quantum_info.Statevector
while keeping the same public API (validate, simulate, StepSession). The route
layer in main.py does not need to change.

Conventions (see docs/api.md):
- basis strings have qubit 0 leftmost; Qiskit is little-endian, so API wire
  i maps to Qiskit qubit (num_bits - 1 - i) and statevector indices are
  reversed when formatted as basis strings.
- snapshots are sparse: amplitudes with prob < EPS are omitted.
"""

from __future__ import annotations

import random

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit.library import (
    HGate,
    IGate,
    PhaseGate,
    RXGate,
    RYGate,
    RZGate,
    SdgGate,
    SGate,
    SwapGate,
    SXGate,
    TdgGate,
    TGate,
    XGate,
    YGate,
    ZGate,
)
from qiskit.quantum_info import Operator, Statevector

EPS = 1e-6
MAX_BITS = 16
NUM_SEGMENTS = 10

SINGLE_QUBIT_GATES = {"H", "X", "Y", "Z", "S", "T", "Sdg", "Tdg", "SX", "I"}
PARAMETERIZED_GATES = {"Rx", "Ry", "Rz", "P"}
ALL_GATE_TYPES = SINGLE_QUBIT_GATES | PARAMETERIZED_GATES | {"C", "CX", "CZ", "CCX", "SWAP", "M"}

# Multi-qubit named gates are just controlled versions of a base gate.
CONTROLLED_BASE = {"C": "X", "CX": "X", "CZ": "Z", "CCX": "X"}

GATE_CLASSES: dict[str, type] = {
    "H": HGate,
    "X": XGate,
    "Y": YGate,
    "Z": ZGate,
    "S": SGate,
    "Sdg": SdgGate,
    "T": TGate,
    "Tdg": TdgGate,
    "SX": SXGate,
    "I": IGate,
    "Rx": RXGate,
    "Ry": RYGate,
    "Rz": RZGate,
    "P": PhaseGate,
}


def _api_to_qiskit_bit(api_bit: int, num_bits: int) -> int:
    """API wire index (qubit 0 leftmost) -> Qiskit qubit index (little-endian)."""
    return num_bits - 1 - api_bit


def _make_unitary_op(op_type: str, angle: float | None, targets: list[int], controls: list[int], num_bits: int) -> Operator:
    """Build a Qiskit Operator for a single gate operation."""
    base_type = CONTROLLED_BASE.get(op_type, op_type)
    qiskit_controls = [_api_to_qiskit_bit(c, num_bits) for c in controls]

    if base_type == "SWAP":
        qiskit_targets = [_api_to_qiskit_bit(t, num_bits) for t in targets]
        gate = SwapGate()
        qubits = qiskit_controls + qiskit_targets
    else:
        gate_cls = GATE_CLASSES[base_type]
        qiskit_target = _api_to_qiskit_bit(targets[0], num_bits)
        if base_type in PARAMETERIZED_GATES:
            gate = gate_cls(angle or 0.0)
        else:
            gate = gate_cls()
        qubits = qiskit_controls + [qiskit_target]

    if qiskit_controls:
        gate = gate.control(len(qiskit_controls))

    qc = QuantumCircuit(num_bits)
    qc.append(gate, qubits)
    return Operator(qc)


def _measure(state: Statevector, api_target: int, num_bits: int, measurements: dict[int, int], op_id: int) -> Statevector:
    """Collapse `target` in place; returns the updated state and records outcome."""
    qiskit_target = _api_to_qiskit_bit(api_target, num_bits)
    probs = state.probabilities([qiskit_target])
    p1 = float(probs[1])
    outcome = measurements.get(op_id)
    if outcome is None:
        outcome = 1 if random.random() < p1 else 0

    data = np.asarray(state.data, dtype=complex).copy()
    idx = np.arange(len(data))
    tmask = 1 << qiskit_target
    zero_on_target = (idx & tmask) == 0
    if outcome == 1:
        data[zero_on_target] = 0.0
    else:
        data[~zero_on_target] = 0.0

    norm = float(np.linalg.norm(data))
    if norm > EPS:
        data /= norm
    measurements[op_id] = outcome
    return Statevector(data)


def _apply_op(state: Statevector, op: dict, num_bits: int, measurements: dict[int, int]) -> Statevector:
    op_type = op["type"]
    targets = op.get("targets") or []
    controls = op.get("controls") or []
    if op_type == "M":
        return _measure(state, targets[0], num_bits, measurements, op["id"])
    return state.evolve(_make_unitary_op(op_type, op.get("angle"), targets, controls, num_bits))


def validate(circuit: dict) -> list[dict]:
    """Returns a list of {opId, message} errors; empty means valid."""
    errors: list[dict] = []
    num_bits = circuit.get("numBits")
    if not isinstance(num_bits, int) or not 1 <= num_bits <= MAX_BITS:
        errors.append({"opId": None, "message": f"numBits must be an int in 1..{MAX_BITS}"})
        return errors  # nothing else is checkable

    def check_bits(op: dict, bits: list[int], label: str) -> None:
        for b in bits:
            if not isinstance(b, int) or not 0 <= b < num_bits:
                errors.append({"opId": op["id"], "message": f"{label} bit {b!r} out of range 0..{num_bits - 1}"})

    for op in circuit.get("ops", []):
        op_type = op.get("type")
        targets = op.get("targets") or []
        controls = op.get("controls") or []
        segment = op.get("segment")

        if op_type not in ALL_GATE_TYPES:
            errors.append({"opId": op.get("id"), "message": f"unknown gate type {op_type!r}"})
            continue
        if not isinstance(segment, int) or not 0 <= segment < NUM_SEGMENTS:
            errors.append({"opId": op["id"], "message": f"segment must be an int in 0..{NUM_SEGMENTS - 1}"})
        check_bits(op, targets, "target")
        check_bits(op, controls, "control")
        if set(targets) & set(controls):
            errors.append({"opId": op["id"], "message": "a bit cannot be both target and control"})

        if op_type in PARAMETERIZED_GATES and op.get("angle") is None:
            errors.append({"opId": op["id"], "message": f"{op_type} requires an angle (radians)"})
        if op_type in ("C", "CX", "CZ") and (len(targets) != 1 or len(controls) != 1):
            errors.append({"opId": op["id"], "message": f"{op_type} requires exactly 1 target and 1 control"})
        if op_type == "CCX" and (len(targets) != 1 or len(controls) != 2):
            errors.append({"opId": op["id"], "message": "CCX requires exactly 1 target and 2 controls"})
        if op_type == "SWAP" and len(targets) != 2:
            errors.append({"opId": op["id"], "message": "SWAP requires exactly 2 targets"})
        if op_type in SINGLE_QUBIT_GATES | PARAMETERIZED_GATES | {"M"} and len(targets) != 1:
            errors.append({"opId": op["id"], "message": f"{op_type} requires exactly 1 target"})
    return errors


def _snapshot(state: Statevector, measurements: dict[int, int], num_bits: int, segment: int) -> dict:
    data = np.asarray(state.data, dtype=complex)
    probs = np.abs(data) ** 2
    nz = np.nonzero(probs >= EPS)[0]
    # Qiskit indices are little-endian; reverse the binary string so that
    # qubit 0 (leftmost in the API basis) appears first.
    statevector = [
        {
            "basis": format(int(i), f"0{num_bits}b"),
            "re": round(float(data[i].real), 6),
            "im": round(float(data[i].imag), 6),
            "prob": round(float(probs[i]), 6),
        }
        for i in nz
    ]
    return {
        "segment": segment,
        "statevector": statevector,
        "measurements": {str(k): v for k, v in measurements.items()},
    }


def simulate(circuit: dict, through_segment: int | None = None) -> dict:
    """One-shot simulation. Raises ValueError with validation errors."""
    errors = validate(circuit)
    if errors:
        raise ValueError(errors)
    num_bits = circuit["numBits"]
    state = Statevector.from_label("0" * num_bits)
    measurements: dict[int, int] = {}
    last_segment = -1
    for op in sorted(circuit.get("ops", []), key=lambda o: o["segment"]):
        if through_segment is not None and op["segment"] > through_segment:
            break
        state = _apply_op(state, op, num_bits, measurements)
        last_segment = max(last_segment, op["segment"])
    return _snapshot(state, measurements, num_bits, last_segment)


class StepSession:
    """Interactive stepping session backing the WebSocket endpoint."""

    def __init__(self, circuit: dict):
        errors = validate(circuit)
        if errors:
            raise ValueError(errors)
        self.circuit = circuit
        self.num_bits = circuit["numBits"]
        self.segments = sorted({op["segment"] for op in circuit.get("ops", [])})
        self.cursor = -1
        self.state = Statevector.from_label("0" * self.num_bits)
        self.measurements: dict[int, int] = {}

    @property
    def num_steps(self) -> int:
        return len(self.segments)

    def snapshot(self) -> dict:
        return _snapshot(self.state, self.measurements, self.num_bits, self.cursor)

    def _apply_segment(self, segment: int) -> None:
        for op in self.circuit["ops"]:
            if op["segment"] == segment:
                self.state = _apply_op(self.state, op, self.num_bits, self.measurements)

    def step(self) -> dict | None:
        """Advance one segment; returns None when already at the end."""
        upcoming = [s for s in self.segments if s > self.cursor]
        if not upcoming:
            return None
        self.cursor = upcoming[0]
        self._apply_segment(self.cursor)
        return self.snapshot()

    def run(self) -> dict:
        while self.step() is not None:
            pass
        return self.snapshot()

    def reset(self) -> dict:
        self.cursor = -1
        self.state = Statevector.from_label("0" * self.num_bits)
        self.measurements.clear()
        return self.snapshot()

    def peek(self, segment: int) -> dict:
        """State as of `segment` without moving the cursor.

        Re-simulates from scratch; measurement ops already observed in this
        session keep their recorded outcome so peeks stay consistent.
        """
        state = Statevector.from_label("0" * self.num_bits)
        measurements: dict[int, int] = dict(self.measurements)
        seen: dict[int, int] = {}
        for op in sorted(self.circuit["ops"], key=lambda o: o["segment"]):
            if op["segment"] > segment:
                break
            if op["type"] == "M":
                state = _measure(
                    state, op["targets"][0], self.num_bits, measurements, op["id"]
                )
                seen[op["id"]] = measurements[op["id"]]
            else:
                state = _apply_op(state, op, self.num_bits, seen)
        return _snapshot(state, seen, self.num_bits, segment)
