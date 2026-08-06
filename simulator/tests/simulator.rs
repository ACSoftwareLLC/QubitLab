//! Port of the Python backend's pytest suite (server/test_simulator.py).
//! Measurement sampling is driven by a seeded ChaCha8Rng, so the statistical
//! tests are deterministic rather than merely overwhelmingly likely.

use std::collections::{HashMap, HashSet};

use num_complex::Complex64;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde_json::{json, Value};

use quantum_dnd_simulator::validate::{PARAMETERIZED_GATES, SINGLE_QUBIT_GATES};
use quantum_dnd_simulator::{
    parse_circuit, simulate_with_rng, validate, Circuit, Snapshot, StepSession, ValidationError,
    MAX_BITS, NUM_SEGMENTS,
};

// --- helpers mirroring the Python test fixtures -----------------------------

fn op(id: u64, op_type: &str, segment: i64, targets: &[u64]) -> Value {
    json!({"id": id, "type": op_type, "segment": segment, "targets": targets, "controls": [], "angle": null})
}

fn opc(id: u64, op_type: &str, segment: i64, targets: &[u64], controls: &[u64]) -> Value {
    json!({"id": id, "type": op_type, "segment": segment, "targets": targets, "controls": controls, "angle": null})
}

fn opa(id: u64, op_type: &str, segment: i64, targets: &[u64], angle: f64) -> Value {
    json!({"id": id, "type": op_type, "segment": segment, "targets": targets, "controls": [], "angle": angle})
}

fn circuit(num_bits: i64, ops: Vec<Value>) -> Value {
    json!({"numBits": num_bits, "ops": ops})
}

fn typed(num_bits: usize, ops: Vec<Value>) -> Circuit {
    parse_circuit(&circuit(num_bits as i64, ops)).expect("circuit should be valid")
}

fn probs(snapshot: &Snapshot) -> HashMap<String, f64> {
    snapshot
        .statevector
        .iter()
        .map(|e| (e.basis.clone(), e.prob))
        .collect()
}

fn amps(snapshot: &Snapshot) -> HashMap<String, Complex64> {
    snapshot
        .statevector
        .iter()
        .map(|e| (e.basis.clone(), Complex64::new(e.re, e.im)))
        .collect()
}

const TOL: f64 = 1e-6;

fn assert_probs(snapshot: &Snapshot, expected: &[(&str, f64)]) {
    let actual = probs(snapshot);
    let mut actual_keys: Vec<&String> = actual.keys().collect();
    actual_keys.sort();
    let mut expected_keys: Vec<&str> = expected.iter().map(|(k, _)| *k).collect();
    expected_keys.sort();
    assert_eq!(
        actual_keys, expected_keys,
        "basis keys differ; actual probs: {actual:?}"
    );
    for (k, v) in expected {
        let a = actual[*k];
        assert!((a - v).abs() < TOL, "prob[{k}] = {a}, expected {v}");
    }
}

fn assert_amp(snapshot: &Snapshot, basis: &str, expected: Complex64) {
    let actual = amps(snapshot);
    let a = actual[basis];
    assert!(
        (a - expected).norm() < TOL,
        "amp[{basis}] = {a}, expected {expected}"
    );
}

fn err(op_id: Option<u64>, message: &str) -> ValidationError {
    ValidationError {
        op_id,
        message: message.to_string(),
    }
}

// --- validation ---------------------------------------------------------------

mod test_validate {
    use super::*;

    #[test]
    fn empty_circuit_is_valid() {
        assert!(validate(&circuit(2, vec![])).is_empty());
    }

    #[test]
    fn valid_single_qubit_circuit() {
        assert!(validate(&circuit(1, vec![op(1, "H", 0, &[0])])).is_empty());
    }

    #[test]
    fn numbits_too_low() {
        assert_eq!(
            validate(&circuit(0, vec![])),
            vec![err(None, &format!("numBits must be an int in 1..{MAX_BITS}"))]
        );
    }

    #[test]
    fn numbits_too_high() {
        assert_eq!(
            validate(&circuit(MAX_BITS as i64 + 1, vec![])),
            vec![err(None, &format!("numBits must be an int in 1..{MAX_BITS}"))]
        );
    }

    #[test]
    fn unknown_gate_type() {
        assert_eq!(
            validate(&circuit(1, vec![op(1, "FOO", 0, &[0])])),
            vec![err(Some(1), "unknown gate type 'FOO'")]
        );
    }

    #[test]
    fn segment_out_of_range() {
        assert_eq!(
            validate(&circuit(1, vec![op(1, "H", NUM_SEGMENTS, &[0])])),
            vec![err(Some(1), &format!("segment must be an int in 0..{}", NUM_SEGMENTS - 1))]
        );
    }

    #[test]
    fn target_bit_out_of_range() {
        assert_eq!(
            validate(&circuit(1, vec![op(1, "H", 0, &[1])])),
            vec![err(Some(1), "target bit 1 out of range 0..0")]
        );
    }

    #[test]
    fn control_bit_out_of_range() {
        assert_eq!(
            validate(&circuit(2, vec![opc(1, "X", 0, &[0], &[2])])),
            vec![err(Some(1), "control bit 2 out of range 0..1")]
        );
    }

    #[test]
    fn target_and_control_overlap() {
        assert_eq!(
            validate(&circuit(1, vec![opc(1, "X", 0, &[0], &[0])])),
            vec![err(Some(1), "a bit cannot be both target and control")]
        );
    }

    #[test]
    fn parameterized_gate_requires_angle() {
        for gate_type in PARAMETERIZED_GATES {
            assert_eq!(
                validate(&circuit(1, vec![op(1, gate_type, 0, &[0])])),
                vec![err(Some(1), &format!("{gate_type} requires an angle (radians)"))],
                "gate {gate_type}"
            );
        }
    }

    #[test]
    fn cx_cz_requires_one_target_and_one_control() {
        for gate_type in ["C", "CX", "CZ"] {
            assert_eq!(
                validate(&circuit(3, vec![opc(1, gate_type, 0, &[1, 2], &[0])])),
                vec![err(Some(1), &format!("{gate_type} requires exactly 1 target and 1 control"))],
                "gate {gate_type}"
            );
        }
    }

    #[test]
    fn ccx_requires_one_target_and_two_controls() {
        assert_eq!(
            validate(&circuit(3, vec![opc(1, "CCX", 0, &[2], &[0])])),
            vec![err(Some(1), "CCX requires exactly 1 target and 2 controls")]
        );
    }

    #[test]
    fn swap_requires_two_targets() {
        assert_eq!(
            validate(&circuit(2, vec![op(1, "SWAP", 0, &[0])])),
            vec![err(Some(1), "SWAP requires exactly 2 targets")]
        );
    }

    #[test]
    fn single_target_gates_require_one_target() {
        for gate_type in SINGLE_QUBIT_GATES
            .iter()
            .chain(PARAMETERIZED_GATES)
            .chain(["M"].iter())
        {
            let operation = if PARAMETERIZED_GATES.contains(gate_type) {
                opa(1, gate_type, 0, &[0, 1], 0.5)
            } else {
                op(1, gate_type, 0, &[0, 1])
            };
            assert_eq!(
                validate(&circuit(2, vec![operation])),
                vec![err(Some(1), &format!("{gate_type} requires exactly 1 target"))],
                "gate {gate_type}"
            );
        }
    }

    #[test]
    fn multiple_errors_reported() {
        let circuit = circuit(
            1,
            vec![opc(1, "CX", 0, &[0], &[]), op(2, "H", NUM_SEGMENTS + 1, &[2])],
        );
        assert_eq!(validate(&circuit).len(), 3);
    }
}

// --- single-qubit gates ---------------------------------------------------------

mod test_single_qubit_gates {
    use super::*;

    #[test]
    fn identity_leaves_initial_state() {
        let snapshot = simulate_with_rng(&typed(2, vec![op(1, "I", 0, &[0])]), None, &mut rng());
        assert_probs(&snapshot, &[("00", 1.0)]);
    }

    #[test]
    fn x_flips_qubit() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "X", 0, &[0])]), None, &mut rng());
        assert_probs(&snapshot, &[("1", 1.0)]);
    }

    #[test]
    fn hadamard_creates_superposition() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "H", 0, &[0])]), None, &mut rng());
        assert_probs(&snapshot, &[("0", 0.5), ("1", 0.5)]);
    }

    #[test]
    fn y_gate() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "Y", 0, &[0])]), None, &mut rng());
        assert_amp(&snapshot, "1", Complex64::new(0.0, 1.0));
    }

    #[test]
    fn z_gate_leaves_zero_unchanged() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "Z", 0, &[0])]), None, &mut rng());
        assert_probs(&snapshot, &[("0", 1.0)]);
    }

    #[test]
    fn s_and_sdg_are_inverses() {
        let snapshot = simulate_with_rng(
            &typed(1, vec![op(1, "S", 0, &[0]), op(2, "Sdg", 1, &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("0", 1.0)]);
    }

    #[test]
    fn t_and_tdg_are_inverses() {
        let snapshot = simulate_with_rng(
            &typed(1, vec![op(1, "T", 0, &[0]), op(2, "Tdg", 1, &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("0", 1.0)]);
    }

    #[test]
    fn sx_squared_is_x() {
        let snapshot = simulate_with_rng(
            &typed(1, vec![op(1, "SX", 0, &[0]), op(2, "SX", 1, &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("1", 1.0)]);
    }

    #[test]
    fn parameterized_gate_with_angle() {
        for gate_type in PARAMETERIZED_GATES {
            let snapshot = simulate_with_rng(
                &typed(1, vec![opa(1, gate_type, 0, &[0], std::f64::consts::FRAC_PI_4)]),
                None,
                &mut rng(),
            );
            let total: f64 = snapshot.statevector.iter().map(|e| e.prob).sum();
            assert!((total - 1.0).abs() < TOL, "gate {gate_type}: total prob {total}");
        }
    }
}

fn rng() -> ChaCha8Rng {
    ChaCha8Rng::seed_from_u64(42)
}

// --- multi-qubit gates ----------------------------------------------------------

mod test_multi_qubit_gates {
    use super::*;

    #[test]
    fn cx_creates_bell_state() {
        let snapshot = simulate_with_rng(
            &typed(2, vec![op(1, "H", 0, &[0]), opc(2, "CX", 1, &[1], &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("00", 0.5), ("11", 0.5)]);
    }

    #[test]
    fn cz_applies_phase() {
        let snapshot = simulate_with_rng(
            &typed(
                2,
                vec![op(1, "X", 0, &[0]), op(2, "X", 0, &[1]), opc(3, "CZ", 1, &[1], &[0])],
            ),
            None,
            &mut rng(),
        );
        assert_amp(&snapshot, "11", Complex64::new(-1.0, 0.0));
    }

    #[test]
    fn ccx_toffoli() {
        let snapshot = simulate_with_rng(
            &typed(
                3,
                vec![op(1, "X", 0, &[0]), op(2, "X", 0, &[1]), opc(3, "CCX", 1, &[2], &[0, 1])],
            ),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("111", 1.0)]);
    }

    #[test]
    fn swap_exchanges_qubits() {
        // X on qubit 0 gives "10"; SWAP exchanges qubits 0 and 1 -> "01".
        let snapshot = simulate_with_rng(
            &typed(2, vec![op(1, "X", 0, &[0]), op(2, "SWAP", 1, &[0, 1])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("01", 1.0)]);
    }

    #[test]
    fn arbitrary_controlled_single_qubit_gate() {
        // X with explicit controls is equivalent to CX.
        let snapshot = simulate_with_rng(
            &typed(2, vec![op(1, "H", 0, &[0]), opc(2, "X", 1, &[1], &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("00", 0.5), ("11", 0.5)]);
    }
}

// --- simulation control ---------------------------------------------------------

mod test_simulation_control {
    use super::*;

    #[test]
    fn through_segment_stops_early() {
        let circuit = typed(2, vec![op(1, "H", 0, &[0]), op(2, "X", 1, &[1])]);
        let snapshot = simulate_with_rng(&circuit, Some(0), &mut rng());
        assert_eq!(snapshot.segment, 0);
        // H on qubit 0 puts qubit 0 in superposition with qubit 1 still 0.
        assert_probs(&snapshot, &[("00", 0.5), ("10", 0.5)]);
    }

    #[test]
    fn through_segment_none_runs_full_circuit() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "X", 0, &[0])]), None, &mut rng());
        assert_probs(&snapshot, &[("1", 1.0)]);
    }
}

// --- measurement ---------------------------------------------------------------

mod test_measurement {
    use super::*;

    #[test]
    fn measurement_of_one_is_deterministic() {
        let snapshot = simulate_with_rng(
            &typed(1, vec![op(1, "X", 0, &[0]), op(2, "M", 1, &[0])]),
            None,
            &mut rng(),
        );
        assert_probs(&snapshot, &[("1", 1.0)]);
        assert_eq!(
            snapshot.measurements,
            std::collections::BTreeMap::from([("2".to_string(), 1)])
        );
    }

    #[test]
    fn measurement_collapse_is_consistent() {
        // H then measure; repeated simulation samples both outcomes.
        let circuit = typed(1, vec![op(1, "H", 0, &[0]), op(2, "M", 1, &[0])]);
        let mut rng = rng();
        let outcomes: HashSet<u8> = (0..50)
            .map(|_| simulate_with_rng(&circuit, None, &mut rng).measurements["2"])
            .collect();
        assert_eq!(outcomes, HashSet::from([0, 1]));
    }

    #[test]
    fn measurement_of_entangled_qubit_collapses_both() {
        let circuit = typed(
            2,
            vec![op(1, "H", 0, &[0]), opc(2, "CX", 1, &[1], &[0]), op(3, "M", 2, &[1])],
        );
        let mut rng = rng();
        let mut seen: HashMap<u8, Snapshot> = HashMap::new();
        for _ in 0..30 {
            let snapshot = simulate_with_rng(&circuit, None, &mut rng);
            seen.insert(snapshot.measurements["3"], snapshot);
        }
        assert!(seen.contains_key(&0) && seen.contains_key(&1));
        assert_eq!(seen[&0].statevector[0].basis, "00");
        assert_eq!(seen[&1].statevector[0].basis, "11");
    }
}

// --- step session ----------------------------------------------------------------

mod test_step_session {
    use super::*;

    fn session(num_bits: usize, ops: Vec<Value>) -> StepSession<ChaCha8Rng> {
        StepSession::with_rng(typed(num_bits, ops), rng())
    }

    #[test]
    fn num_steps() {
        let session = session(2, vec![op(1, "H", 0, &[0]), op(2, "X", 2, &[1])]);
        assert_eq!(session.num_steps(), 2);
    }

    #[test]
    fn step_advances_through_segments() {
        let mut session = session(1, vec![op(1, "H", 0, &[0]), op(2, "H", 1, &[0])]);
        assert_eq!(session.reset().segment, -1);
        let s1 = session.step().expect("first step");
        assert_eq!(s1.segment, 0);
        assert_probs(&s1, &[("0", 0.5), ("1", 0.5)]);
        let s2 = session.step().expect("second step");
        assert_eq!(s2.segment, 1);
        // Two Hadamards cancel back to |0⟩.
        assert_probs(&s2, &[("0", 1.0)]);
        assert!(session.step().is_none());
    }

    #[test]
    fn run_executes_all_segments() {
        let mut session = session(1, vec![op(1, "X", 0, &[0])]);
        let result = session.run();
        assert_eq!(result.segment, 0);
        assert_probs(&result, &[("1", 1.0)]);
    }

    #[test]
    fn reset_clears_state_and_measurements() {
        let mut session = session(1, vec![op(1, "X", 0, &[0]), op(2, "M", 1, &[0])]);
        session.run();
        assert_eq!(session.measurements(), &HashMap::from([(2, 1)]));
        let reset = session.reset();
        assert_eq!(reset.segment, -1);
        assert_probs(&reset, &[("0", 1.0)]);
        assert!(session.measurements().is_empty());
    }

    #[test]
    fn peek_uses_recorded_measurement_outcome() {
        let mut session = session(1, vec![op(1, "H", 0, &[0]), op(2, "M", 1, &[0])]);
        session.run();
        let recorded = session.measurements()[&2];
        let peek = session.peek(1);
        assert_eq!(peek.measurements["2"], recorded);
        assert_probs(&peek, &[(&recorded.to_string(), 1.0)]);
    }

    #[test]
    fn peek_does_not_move_cursor() {
        let mut session = session(1, vec![op(1, "X", 0, &[0])]);
        session.step();
        assert_eq!(session.cursor(), 0);
        session.peek(0);
        assert_eq!(session.cursor(), 0);
    }

    #[test]
    fn peek_samples_new_outcome_after_reset() {
        let mut session = session(1, vec![op(1, "H", 0, &[0]), op(2, "M", 1, &[0])]);
        session.run();
        session.reset();
        // After reset the measurement is not recorded, so peek samples fresh outcomes.
        let outcomes: HashSet<u8> = (0..30).map(|_| session.peek(1).measurements["2"]).collect();
        assert_eq!(outcomes, HashSet::from([0, 1]));
    }
}

// --- snapshot format -------------------------------------------------------------

mod test_snapshot_format {
    use super::*;

    #[test]
    fn basis_strings_have_qubit_zero_leftmost() {
        let snapshot = simulate_with_rng(&typed(3, vec![op(1, "X", 0, &[0])]), None, &mut rng());
        // API qubit 0 is the leftmost bit.
        assert_probs(&snapshot, &[("100", 1.0)]);
    }

    #[test]
    fn sparse_statevector_omits_small_probs() {
        let snapshot = simulate_with_rng(&typed(3, vec![op(1, "X", 0, &[0])]), None, &mut rng());
        // Only one basis state should be present.
        assert_eq!(snapshot.statevector.len(), 1);
    }

    #[test]
    fn measurement_keys_are_strings() {
        let snapshot = simulate_with_rng(
            &typed(1, vec![op(1, "X", 0, &[0]), op(2, "M", 1, &[0])]),
            None,
            &mut rng(),
        );
        let value = serde_json::to_value(&snapshot).unwrap();
        let measurements = value["measurements"].as_object().unwrap();
        assert_eq!(measurements.get("2"), Some(&json!(1)));
    }

    #[test]
    fn snapshot_rounds_to_six_decimals() {
        let snapshot = simulate_with_rng(&typed(1, vec![op(1, "H", 0, &[0])]), None, &mut rng());
        let entry = &snapshot.statevector[0];
        assert_eq!(entry.re, 0.707107);
        assert_eq!(entry.im, 0.0);
        assert_eq!(entry.prob, 0.5);
    }
}

// --- gate type coverage ------------------------------------------------------------

#[test]
fn all_gate_types_are_known() {
    // Keeps the test suite's gate list in sync with the validator.
    use quantum_dnd_simulator::validate::{is_known_gate, MULTI_QUBIT_GATES};
    let union: HashSet<&str> = SINGLE_QUBIT_GATES
        .iter()
        .chain(PARAMETERIZED_GATES)
        .chain(MULTI_QUBIT_GATES)
        .copied()
        .collect();
    let expected: HashSet<&str> = [
        "H", "X", "Y", "Z", "S", "T", "Sdg", "Tdg", "SX", "I", "Rx", "Ry", "Rz", "P", "C", "CX",
        "CZ", "CCX", "SWAP", "M",
    ]
    .into_iter()
    .collect();
    assert_eq!(union, expected);
    for gate_type in &expected {
        assert!(is_known_gate(gate_type));
    }
}
