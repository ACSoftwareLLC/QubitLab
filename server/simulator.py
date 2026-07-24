"""Naive numpy statevector simulator.

This module is the qiskit seam: every route in main.py talks only to
`validate`, `simulate`, and `StepSession`. When qiskit lands, reimplement
these three against qiskit.Aer and leave the routes untouched.

Conventions (see docs/api.md):
- basis strings have qubit 0 leftmost; internally qubit i maps to bit
  position (num_bits - 1 - i) of the statevector index.
- snapshots are sparse: amplitudes with prob < EPS are omitted.
"""

from __future__ import annotations

import math
import random

import numpy as np

EPS = 1e-6
MAX_BITS = 16
NUM_SEGMENTS = 10

SINGLE_QUBIT_GATES = {"H", "X", "Y", "Z", "S", "T", "Sdg", "Tdg", "SX", "I"}
PARAMETERIZED_GATES = {"Rx", "Ry", "Rz", "P"}
ALL_GATE_TYPES = SINGLE_QUBIT_GATES | PARAMETERIZED_GATES | {"C", "CX", "CZ", "CCX", "SWAP", "M"}


def gate_matrix(op_type: str, angle: float | None) -> np.ndarray:
    s2 = 1 / math.sqrt(2)
    if op_type == "H":
        return np.array([[s2, s2], [s2, -s2]], dtype=complex)
    if op_type == "X":
        return np.array([[0, 1], [1, 0]], dtype=complex)
    if op_type == "Y":
        return np.array([[0, -1j], [1j, 0]], dtype=complex)
    if op_type == "Z":
        return np.array([[1, 0], [0, -1]], dtype=complex)
    if op_type == "S":
        return np.array([[1, 0], [0, 1j]], dtype=complex)
    if op_type == "T":
        return np.array([[1, 0], [0, np.exp(1j * math.pi / 4)]], dtype=complex)
    if op_type == "Sdg":
        return np.array([[1, 0], [0, -1j]], dtype=complex)
    if op_type == "Tdg":
        return np.array([[1, 0], [0, np.exp(-1j * math.pi / 4)]], dtype=complex)
    if op_type == "SX":
        return np.array([[0.5 + 0.5j, 0.5 - 0.5j], [0.5 - 0.5j, 0.5 + 0.5j]], dtype=complex)
    if op_type == "I":
        return np.eye(2, dtype=complex)
    if op_type == "Rx":
        a = angle or 0.0
        return np.array(
            [[math.cos(a / 2), -1j * math.sin(a / 2)], [-1j * math.sin(a / 2), math.cos(a / 2)]],
            dtype=complex,
        )
    if op_type == "Ry":
        a = angle or 0.0
        return np.array(
            [[math.cos(a / 2), -math.sin(a / 2)], [math.sin(a / 2), math.cos(a / 2)]], dtype=complex
        )
    if op_type == "Rz":
        a = angle or 0.0
        return np.array(
            [[np.exp(-0.5j * a), 0], [0, np.exp(0.5j * a)]], dtype=complex
        )
    if op_type == "P":
        a = angle or 0.0
        return np.array([[1, 0], [0, np.exp(1j * a)]], dtype=complex)
    raise ValueError(f"no matrix for gate type {op_type!r}")


def _bit_pos(qubit: int, num_bits: int) -> int:
    return num_bits - 1 - qubit


def apply_single(state: np.ndarray, mat: np.ndarray, target: int, controls: list[int], num_bits: int) -> None:
    idx = np.arange(len(state))
    tmask = 1 << _bit_pos(target, num_bits)
    cmask = 0
    for c in controls:
        cmask |= 1 << _bit_pos(c, num_bits)
    lo = idx[((idx & tmask) == 0) & ((idx & cmask) == cmask)]
    hi = lo | tmask
    a = state[lo].copy()
    b = state[hi].copy()
    state[lo] = mat[0, 0] * a + mat[0, 1] * b
    state[hi] = mat[1, 0] * a + mat[1, 1] * b


def apply_swap(state: np.ndarray, q0: int, q1: int, controls: list[int], num_bits: int) -> None:
    idx = np.arange(len(state))
    m0 = 1 << _bit_pos(q0, num_bits)
    m1 = 1 << _bit_pos(q1, num_bits)
    cmask = 0
    for c in controls:
        cmask |= 1 << _bit_pos(c, num_bits)
    b0 = (idx & m0) != 0
    b1 = (idx & m1) != 0
    sel = (b0 & ~b1) & ((idx & cmask) == cmask)
    lo = idx[sel]
    hi = (lo & ~m0) | m1
    tmp = state[lo].copy()
    state[lo] = state[hi]
    state[hi] = tmp


def measure(state: np.ndarray, target: int, num_bits: int, outcome: int | None = None) -> int:
    """Collapse `target` in place; returns the classical outcome."""
    idx = np.arange(len(state))
    tmask = 1 << _bit_pos(target, num_bits)
    p1 = float(np.sum(np.abs(state[(idx & tmask) != 0]) ** 2))
    if outcome is None:
        outcome = 1 if random.random() < p1 else 0
    keep = (idx & tmask) != 0 if outcome == 1 else (idx & tmask) == 0
    state[~keep] = 0.0
    norm = float(np.linalg.norm(state))
    if norm > 0:
        state /= norm
    return outcome


# Multi-qubit named gates are just controlled versions of a base gate.
CONTROLLED_BASE = {"C": "X", "CX": "X", "CZ": "Z", "CCX": "X"}


def apply_op(state: np.ndarray, op: dict, num_bits: int, measurements: dict[int, int]) -> None:
    op_type = op["type"]
    targets = op.get("targets") or []
    controls = op.get("controls") or []
    if op_type == "M":
        measurements[op["id"]] = measure(
            state, targets[0], num_bits, outcome=measurements.get(op["id"])
        )
    elif op_type == "SWAP":
        apply_swap(state, targets[0], targets[1], controls, num_bits)
    else:
        mat = gate_matrix(CONTROLLED_BASE.get(op_type, op_type), op.get("angle"))
        apply_single(state, mat, targets[0], controls, num_bits)


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


def _snapshot(state: np.ndarray, measurements: dict[int, int], num_bits: int, segment: int) -> dict:
    probs = np.abs(state) ** 2
    nz = np.nonzero(probs >= EPS)[0]
    statevector = [
        {
            "basis": format(int(i), f"0{num_bits}b"),
            "re": round(float(state[i].real), 6),
            "im": round(float(state[i].imag), 6),
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
    state = np.zeros(2**num_bits, dtype=complex)
    state[0] = 1.0
    measurements: dict[int, int] = {}
    last_segment = -1
    for op in sorted(circuit.get("ops", []), key=lambda o: o["segment"]):
        if through_segment is not None and op["segment"] > through_segment:
            break
        apply_op(state, op, num_bits, measurements)
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
        self.state = np.zeros(2**self.num_bits, dtype=complex)
        self.state[0] = 1.0
        self.measurements: dict[int, int] = {}

    @property
    def num_steps(self) -> int:
        return len(self.segments)

    def snapshot(self) -> dict:
        return _snapshot(self.state, self.measurements, self.num_bits, self.cursor)

    def _apply_segment(self, segment: int) -> None:
        for op in self.circuit["ops"]:
            if op["segment"] == segment:
                apply_op(self.state, op, self.num_bits, self.measurements)

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
        self.state[:] = 0.0
        self.state[0] = 1.0
        self.measurements.clear()
        return self.snapshot()

    def peek(self, segment: int) -> dict:
        """State as of `segment` without moving the cursor.

        Re-simulates from scratch; measurement ops already observed in this
        session keep their recorded outcome so peeks stay consistent.
        """
        state = np.zeros(2**self.num_bits, dtype=complex)
        state[0] = 1.0
        measurements: dict[int, int] = dict(self.measurements)
        seen: dict[int, int] = {}
        for op in sorted(self.circuit["ops"], key=lambda o: o["segment"]):
            if op["segment"] > segment:
                break
            if op["type"] == "M":
                seen[op["id"]] = measure(
                    state, op["targets"][0], self.num_bits, outcome=self.measurements.get(op["id"])
                )
            else:
                apply_op(state, op, self.num_bits, seen)
        return _snapshot(state, seen, self.num_bits, segment)
