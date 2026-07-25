"""Unit tests for the Qiskit-backed simulator."""

from __future__ import annotations

import math
import random

import pytest

from simulator import (
    ALL_GATE_TYPES,
    MAX_BITS,
    NUM_SEGMENTS,
    PARAMETERIZED_GATES,
    SINGLE_QUBIT_GATES,
    StepSession,
    simulate,
    validate,
)


def _op(op_id: int, op_type: str, segment: int, targets: list[int], controls: list[int] | None = None, angle: float | None = None) -> dict:
    return {
        "id": op_id,
        "type": op_type,
        "segment": segment,
        "targets": targets,
        "controls": controls or [],
        "angle": angle,
    }


def _circuit(num_bits: int, ops: list[dict]) -> dict:
    return {"numBits": num_bits, "ops": ops}


def _amplitudes(snapshot: dict) -> dict[str, complex]:
    return {entry["basis"]: complex(entry["re"], entry["im"]) for entry in snapshot["statevector"]}


def _probs(snapshot: dict) -> dict[str, float]:
    return {entry["basis"]: entry["prob"] for entry in snapshot["statevector"]}


class TestValidate:
    def test_empty_circuit_is_valid(self):
        assert validate(_circuit(2, [])) == []

    def test_valid_single_qubit_circuit(self):
        circuit = _circuit(1, [_op(1, "H", 0, [0])])
        assert validate(circuit) == []

    def test_numbits_too_low(self):
        assert validate(_circuit(0, [])) == [
            {"opId": None, "message": f"numBits must be an int in 1..{MAX_BITS}"}
        ]

    def test_numbits_too_high(self):
        assert validate(_circuit(MAX_BITS + 1, [])) == [
            {"opId": None, "message": f"numBits must be an int in 1..{MAX_BITS}"}
        ]

    def test_unknown_gate_type(self):
        assert validate(_circuit(1, [_op(1, "FOO", 0, [0])])) == [
            {"opId": 1, "message": "unknown gate type 'FOO'"}
        ]

    def test_segment_out_of_range(self):
        assert validate(_circuit(1, [_op(1, "H", NUM_SEGMENTS, [0])])) == [
            {"opId": 1, "message": f"segment must be an int in 0..{NUM_SEGMENTS - 1}"}
        ]

    def test_target_bit_out_of_range(self):
        assert validate(_circuit(1, [_op(1, "H", 0, [1])])) == [
            {"opId": 1, "message": "target bit 1 out of range 0..0"}
        ]

    def test_control_bit_out_of_range(self):
        assert validate(_circuit(2, [_op(1, "X", 0, [0], [2])])) == [
            {"opId": 1, "message": "control bit 2 out of range 0..1"}
        ]

    def test_target_and_control_overlap(self):
        assert validate(_circuit(1, [_op(1, "X", 0, [0], [0])])) == [
            {"opId": 1, "message": "a bit cannot be both target and control"}
        ]

    @pytest.mark.parametrize("gate_type", list(PARAMETERIZED_GATES))
    def test_parameterized_gate_requires_angle(self, gate_type: str):
        assert validate(_circuit(1, [_op(1, gate_type, 0, [0])])) == [
            {"opId": 1, "message": f"{gate_type} requires an angle (radians)"}
        ]

    @pytest.mark.parametrize("gate_type", ["C", "CX", "CZ"])
    def test_cx_cz_requires_one_target_and_one_control(self, gate_type: str):
        assert validate(_circuit(3, [_op(1, gate_type, 0, [1, 2], [0])])) == [
            {"opId": 1, "message": f"{gate_type} requires exactly 1 target and 1 control"}
        ]

    def test_ccx_requires_one_target_and_two_controls(self):
        assert validate(_circuit(3, [_op(1, "CCX", 0, [2], [0])])) == [
            {"opId": 1, "message": "CCX requires exactly 1 target and 2 controls"}
        ]

    def test_swap_requires_two_targets(self):
        assert validate(_circuit(2, [_op(1, "SWAP", 0, [0])])) == [
            {"opId": 1, "message": "SWAP requires exactly 2 targets"}
        ]

    @pytest.mark.parametrize("gate_type", list(SINGLE_QUBIT_GATES | PARAMETERIZED_GATES | {"M"}))
    def test_single_target_gates_require_one_target(self, gate_type: str):
        angle = 0.5 if gate_type in PARAMETERIZED_GATES else None
        assert validate(_circuit(2, [_op(1, gate_type, 0, [0, 1], angle=angle)])) == [
            {"opId": 1, "message": f"{gate_type} requires exactly 1 target"}
        ]

    def test_multiple_errors_reported(self):
        circuit = _circuit(1, [
            _op(1, "CX", 0, [0]),
            _op(2, "H", NUM_SEGMENTS + 1, [2]),
        ])
        errors = validate(circuit)
        assert len(errors) == 3


class TestSingleQubitGates:
    def test_identity_leaves_initial_state(self):
        snapshot = simulate(_circuit(2, [_op(1, "I", 0, [0])]))
        assert _probs(snapshot) == {"00": pytest.approx(1.0)}

    def test_x_flips_qubit(self):
        snapshot = simulate(_circuit(1, [_op(1, "X", 0, [0])]))
        assert _probs(snapshot) == {"1": pytest.approx(1.0)}

    def test_hadamard_creates_superposition(self):
        snapshot = simulate(_circuit(1, [_op(1, "H", 0, [0])]))
        probs = _probs(snapshot)
        assert set(probs) == {"0", "1"}
        assert probs["0"] == pytest.approx(0.5)
        assert probs["1"] == pytest.approx(0.5)

    def test_y_gate(self):
        snapshot = simulate(_circuit(1, [_op(1, "Y", 0, [0])]))
        amps = _amplitudes(snapshot)
        assert amps["1"] == pytest.approx(1j)

    def test_z_gate_leaves_zero_unchanged(self):
        snapshot = simulate(_circuit(1, [_op(1, "Z", 0, [0])]))
        assert _probs(snapshot) == {"0": pytest.approx(1.0)}

    def test_s_and_sdg_are_inverses(self):
        snapshot = simulate(_circuit(1, [_op(1, "S", 0, [0]), _op(2, "Sdg", 1, [0])]))
        assert _probs(snapshot) == {"0": pytest.approx(1.0)}

    def test_t_and_tdg_are_inverses(self):
        snapshot = simulate(_circuit(1, [_op(1, "T", 0, [0]), _op(2, "Tdg", 1, [0])]))
        assert _probs(snapshot) == {"0": pytest.approx(1.0)}

    def test_sx_squared_is_x(self):
        snapshot = simulate(_circuit(1, [_op(1, "SX", 0, [0]), _op(2, "SX", 1, [0])]))
        assert _probs(snapshot) == {"1": pytest.approx(1.0)}

    @pytest.mark.parametrize("gate_type", list(PARAMETERIZED_GATES))
    def test_parameterized_gate_with_angle(self, gate_type: str):
        # Smoke test: each parameterized gate accepts an angle and produces a valid state.
        snapshot = simulate(_circuit(1, [_op(1, gate_type, 0, [0], angle=math.pi / 4)]))
        total = sum(entry["prob"] for entry in snapshot["statevector"])
        assert total == pytest.approx(1.0)


class TestMultiQubitGates:
    def test_cx_creates_bell_state(self):
        snapshot = simulate(_circuit(2, [
            _op(1, "H", 0, [0]),
            _op(2, "CX", 1, [1], [0]),
        ]))
        probs = _probs(snapshot)
        assert probs == {"00": pytest.approx(0.5), "11": pytest.approx(0.5)}

    def test_cz_applies_phase(self):
        snapshot = simulate(_circuit(2, [
            _op(1, "X", 0, [0]),
            _op(2, "X", 0, [1]),
            _op(3, "CZ", 1, [1], [0]),
        ]))
        amps = _amplitudes(snapshot)
        assert amps["11"] == pytest.approx(-1.0)

    def test_ccx_toffoli(self):
        snapshot = simulate(_circuit(3, [
            _op(1, "X", 0, [0]),
            _op(2, "X", 0, [1]),
            _op(3, "CCX", 1, [2], [0, 1]),
        ]))
        assert _probs(snapshot) == {"111": pytest.approx(1.0)}

    def test_swap_exchanges_qubits(self):
        snapshot = simulate(_circuit(2, [
            _op(1, "X", 0, [0]),
            _op(2, "SWAP", 1, [0, 1]),
        ]))
        # X on qubit 0 gives "10"; SWAP exchanges qubits 0 and 1 -> "01".
        assert _probs(snapshot) == {"01": pytest.approx(1.0)}

    def test_arbitrary_controlled_single_qubit_gate(self):
        # X with explicit controls is equivalent to CX.
        snapshot = simulate(_circuit(2, [
            _op(1, "H", 0, [0]),
            _op(2, "X", 1, [1], [0]),
        ]))
        probs = _probs(snapshot)
        assert probs == {"00": pytest.approx(0.5), "11": pytest.approx(0.5)}


class TestSimulationControl:
    def test_through_segment_stops_early(self):
        circuit = _circuit(2, [
            _op(1, "H", 0, [0]),
            _op(2, "X", 1, [1]),
        ])
        snapshot = simulate(circuit, through_segment=0)
        assert snapshot["segment"] == 0
        # H on qubit 0 puts qubit 0 in superposition with qubit 1 still 0.
        assert _probs(snapshot) == {"00": pytest.approx(0.5), "10": pytest.approx(0.5)}

    def test_through_segment_none_runs_full_circuit(self):
        snapshot = simulate(_circuit(1, [_op(1, "X", 0, [0])]), through_segment=None)
        assert _probs(snapshot) == {"1": pytest.approx(1.0)}


class TestMeasurement:
    def test_measurement_of_one_is_deterministic(self):
        snapshot = simulate(_circuit(1, [
            _op(1, "X", 0, [0]),
            _op(2, "M", 1, [0]),
        ]))
        assert _probs(snapshot) == {"1": pytest.approx(1.0)}
        assert snapshot["measurements"] == {"2": 1}

    def test_measurement_collapse_is_consistent(self):
        # H then measure; repeated simulation should eventually sample both outcomes.
        circuit = _circuit(1, [
            _op(1, "H", 0, [0]),
            _op(2, "M", 1, [0]),
        ])
        outcomes = {simulate(circuit)["measurements"]["2"] for _ in range(50)}
        assert outcomes == {0, 1}

    def test_measurement_of_entangled_qubit_collapses_both(self):
        circuit = _circuit(2, [
            _op(1, "H", 0, [0]),
            _op(2, "CX", 1, [1], [0]),
            _op(3, "M", 2, [1]),
        ])
        seen = {result["measurements"]["3"]: result for result in [simulate(circuit) for _ in range(30)]}
        assert 0 in seen and 1 in seen
        assert seen[0]["statevector"][0]["basis"] == "00"
        assert seen[1]["statevector"][0]["basis"] == "11"


class TestStepSession:
    def test_num_steps(self):
        session = StepSession(_circuit(2, [
            _op(1, "H", 0, [0]),
            _op(2, "X", 2, [1]),
        ]))
        assert session.num_steps == 2

    def test_step_advances_through_segments(self):
        session = StepSession(_circuit(1, [
            _op(1, "H", 0, [0]),
            _op(2, "H", 1, [0]),
        ]))
        assert session.reset()["segment"] == -1
        s1 = session.step()
        assert s1["segment"] == 0
        assert _probs(s1) == {"0": pytest.approx(0.5), "1": pytest.approx(0.5)}
        s2 = session.step()
        assert s2["segment"] == 1
        # Two Hadamards cancel back to |0⟩.
        assert _probs(s2) == {"0": pytest.approx(1.0)}
        assert session.step() is None

    def test_run_executes_all_segments(self):
        session = StepSession(_circuit(1, [_op(1, "X", 0, [0])]))
        result = session.run()
        assert result["segment"] == 0
        assert _probs(result) == {"1": pytest.approx(1.0)}

    def test_reset_clears_state_and_measurements(self):
        session = StepSession(_circuit(1, [
            _op(1, "X", 0, [0]),
            _op(2, "M", 1, [0]),
        ]))
        session.run()
        assert session.measurements == {2: 1}
        reset_snapshot = session.reset()
        assert reset_snapshot["segment"] == -1
        assert _probs(reset_snapshot) == {"0": pytest.approx(1.0)}
        assert session.measurements == {}

    def test_peek_uses_recorded_measurement_outcome(self):
        random.seed(0)
        session = StepSession(_circuit(1, [
            _op(1, "H", 0, [0]),
            _op(2, "M", 1, [0]),
        ]))
        session.run()
        recorded = session.measurements[2]
        peek = session.peek(1)
        assert peek["measurements"]["2"] == recorded
        assert _probs(peek) == {str(recorded): pytest.approx(1.0)}

    def test_peek_does_not_move_cursor(self):
        session = StepSession(_circuit(1, [_op(1, "X", 0, [0])]))
        session.step()
        assert session.cursor == 0
        session.peek(0)
        assert session.cursor == 0

    def test_peek_samples_new_outcome_after_reset(self):
        session = StepSession(_circuit(1, [
            _op(1, "H", 0, [0]),
            _op(2, "M", 1, [0]),
        ]))
        session.run()
        session.reset()
        # After reset the measurement is not recorded, so peek may sample either outcome.
        outcomes = {session.peek(1)["measurements"]["2"] for _ in range(30)}
        assert outcomes == {0, 1}


class TestSnapshotFormat:
    def test_basis_strings_have_qubit_zero_leftmost(self):
        snapshot = simulate(_circuit(3, [
            _op(1, "X", 0, [0]),
        ]))
        # API qubit 0 is the leftmost bit.
        assert _probs(snapshot) == {"100": pytest.approx(1.0)}

    def test_sparse_statevector_omits_small_probs(self):
        snapshot = simulate(_circuit(3, [_op(1, "X", 0, [0])]))
        # Only one basis state should be present.
        assert len(snapshot["statevector"]) == 1

    def test_measurement_keys_are_strings(self):
        snapshot = simulate(_circuit(1, [
            _op(1, "X", 0, [0]),
            _op(2, "M", 1, [0]),
        ]))
        assert all(isinstance(k, str) for k in snapshot["measurements"].keys())

    def test_snapshot_rounds_to_six_decimals(self):
        snapshot = simulate(_circuit(1, [_op(1, "H", 0, [0])]))
        entry = snapshot["statevector"][0]
        assert entry["re"] == 0.707107
        assert entry["im"] == 0.0
        assert entry["prob"] == 0.5


class TestGateTypeCoverage:
    def test_all_gate_types_are_known(self):
        # Ensures the test suite's gate list stays in sync with the simulator.
        assert ALL_GATE_TYPES == SINGLE_QUBIT_GATES | PARAMETERIZED_GATES | {"C", "CX", "CZ", "CCX", "SWAP", "M"}
