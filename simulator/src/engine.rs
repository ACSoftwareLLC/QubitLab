//! Statevector engine: gate matrices, gate application, measurement,
//! snapshots, and one-shot simulation.
//!
//! Gates are applied directly to the statevector (O(2^n) per gate) rather
//! than materializing a full unitary matrix like the old Qiskit backend did.
//! Controlled gates use the exact `gate.control(n)` semantics: the base gate
//! acts on the target iff all control bits are |1⟩.

use std::collections::{BTreeMap, HashMap};
use std::f64::consts::{FRAC_1_SQRT_2, FRAC_PI_4};

use num_complex::Complex64;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde::Serialize;

use crate::model::{Circuit, GateOp};
use crate::EPS;

type Matrix2 = [[Complex64; 2]; 2];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StatevectorEntry {
    pub basis: String,
    pub re: f64,
    pub im: f64,
    pub prob: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Snapshot {
    pub segment: i64,
    pub statevector: Vec<StatevectorEntry>,
    pub measurements: BTreeMap<String, u8>,
}

/// API wire index (qubit 0 leftmost) -> internal bit index (little-endian).
pub(crate) fn api_to_internal(bit: usize, num_bits: usize) -> usize {
    num_bits - 1 - bit
}

pub fn initial_state(num_bits: usize) -> Vec<Complex64> {
    let mut state = vec![Complex64::new(0.0, 0.0); 1 << num_bits];
    state[0] = Complex64::new(1.0, 0.0);
    state
}

/// Multi-qubit named gates are just controlled versions of a base gate.
fn base_type(op_type: &str) -> &str {
    match op_type {
        "C" | "CX" | "CCX" => "X",
        "CZ" => "Z",
        other => other,
    }
}

/// 2x2 unitary for a single-qubit gate, using Qiskit's matrix conventions.
fn single_qubit_matrix(base: &str, angle: f64) -> Matrix2 {
    let zero = Complex64::new(0.0, 0.0);
    let one = Complex64::new(1.0, 0.0);
    let i = Complex64::new(0.0, 1.0);
    match base {
        "I" => [[one, zero], [zero, one]],
        "X" => [[zero, one], [one, zero]],
        "Y" => [[zero, -i], [i, zero]],
        "Z" => [[one, zero], [zero, -one]],
        "H" => {
            let s = Complex64::new(FRAC_1_SQRT_2, 0.0);
            [[s, s], [s, -s]]
        }
        "S" => [[one, zero], [zero, i]],
        "Sdg" => [[one, zero], [zero, -i]],
        "T" => [[one, zero], [zero, Complex64::from_polar(1.0, FRAC_PI_4)]],
        "Tdg" => [[one, zero], [zero, Complex64::from_polar(1.0, -FRAC_PI_4)]],
        "SX" => {
            let a = Complex64::new(0.5, 0.5);
            let b = Complex64::new(0.5, -0.5);
            [[a, b], [b, a]]
        }
        "Rx" => {
            let (cs, sn) = ((angle / 2.0).cos(), (angle / 2.0).sin());
            [
                [Complex64::new(cs, 0.0), Complex64::new(0.0, -sn)],
                [Complex64::new(0.0, -sn), Complex64::new(cs, 0.0)],
            ]
        }
        "Ry" => {
            let (cs, sn) = ((angle / 2.0).cos(), (angle / 2.0).sin());
            [
                [Complex64::new(cs, 0.0), Complex64::new(-sn, 0.0)],
                [Complex64::new(sn, 0.0), Complex64::new(cs, 0.0)],
            ]
        }
        "Rz" => [
            [Complex64::from_polar(1.0, -angle / 2.0), zero],
            [zero, Complex64::from_polar(1.0, angle / 2.0)],
        ],
        "P" => [[one, zero], [zero, Complex64::from_polar(1.0, angle)]],
        _ => unreachable!("validated gate type {base}"),
    }
}

fn control_mask(controls: &[usize]) -> usize {
    controls.iter().fold(0usize, |acc, &c| acc | (1usize << c))
}

/// Apply `m` to `target`, conditioned on every control bit being |1⟩.
fn apply_single(state: &mut [Complex64], m: &Matrix2, target: usize, controls: &[usize]) {
    let tmask = 1usize << target;
    let cmask = control_mask(controls);
    for i in 0..state.len() {
        if i & tmask == 0 && i & cmask == cmask {
            let j = i | tmask;
            let (a0, a1) = (state[i], state[j]);
            state[i] = m[0][0] * a0 + m[0][1] * a1;
            state[j] = m[1][0] * a0 + m[1][1] * a1;
        }
    }
}

/// Exchange two bit positions, conditioned on every control bit being |1⟩.
fn apply_swap(state: &mut [Complex64], t0: usize, t1: usize, controls: &[usize]) {
    let m0 = 1usize << t0;
    let m1 = 1usize << t1;
    let cmask = control_mask(controls);
    for i in 0..state.len() {
        if i & m0 == 0 && i & m1 != 0 && i & cmask == cmask {
            let j = i ^ m0 ^ m1;
            state.swap(i, j);
        }
    }
}

/// Collapse `target` (internal bit index) in place and record the outcome.
/// A previously recorded outcome for `op_id` is reused instead of sampling.
pub(crate) fn measure<R: Rng>(
    state: &mut [Complex64],
    target: usize,
    rng: &mut R,
    measurements: &mut HashMap<u64, u8>,
    op_id: u64,
) {
    let tmask = 1usize << target;
    let p1: f64 = state
        .iter()
        .enumerate()
        .filter(|(i, _)| i & tmask != 0)
        .map(|(_, a)| a.norm_sqr())
        .sum();
    let outcome = match measurements.get(&op_id) {
        Some(&o) => o,
        None => u8::from(rng.random::<f64>() < p1),
    };

    for (i, a) in state.iter_mut().enumerate() {
        if (i & tmask != 0) != (outcome == 1) {
            *a = Complex64::new(0.0, 0.0);
        }
    }
    let norm = state.iter().map(|a| a.norm_sqr()).sum::<f64>().sqrt();
    if norm > EPS {
        for a in state.iter_mut() {
            *a /= norm;
        }
    }
    measurements.insert(op_id, outcome);
}

pub fn apply_op<R: Rng>(
    state: &mut [Complex64],
    op: &GateOp,
    num_bits: usize,
    measurements: &mut HashMap<u64, u8>,
    rng: &mut R,
) {
    if op.op_type == "M" {
        measure(
            state,
            api_to_internal(op.targets[0], num_bits),
            rng,
            measurements,
            op.id,
        );
        return;
    }
    let controls: Vec<usize> = op
        .controls
        .iter()
        .map(|&c| api_to_internal(c, num_bits))
        .collect();
    if op.op_type == "SWAP" {
        let t0 = api_to_internal(op.targets[0], num_bits);
        let t1 = api_to_internal(op.targets[1], num_bits);
        apply_swap(state, t0, t1, &controls);
        return;
    }
    let matrix = single_qubit_matrix(base_type(&op.op_type), op.angle.unwrap_or(0.0));
    let target = api_to_internal(op.targets[0], num_bits);
    apply_single(state, &matrix, target, &controls);
}

/// Python round(x, 6) — round-half-to-even at the 6th decimal.
fn round6(x: f64) -> f64 {
    format!("{x:.6}").parse().unwrap()
}

pub fn snapshot(
    state: &[Complex64],
    measurements: &HashMap<u64, u8>,
    num_bits: usize,
    segment: i64,
) -> Snapshot {
    let statevector = state
        .iter()
        .enumerate()
        .filter(|(_, a)| a.norm_sqr() >= EPS)
        .map(|(i, a)| StatevectorEntry {
            basis: format!("{i:0num_bits$b}"),
            re: round6(a.re),
            im: round6(a.im),
            prob: round6(a.norm_sqr()),
        })
        .collect();
    Snapshot {
        segment,
        statevector,
        measurements: measurements
            .iter()
            .map(|(k, v)| (k.to_string(), *v))
            .collect(),
    }
}

/// One-shot simulation with a caller-supplied RNG (testable); ops run in
/// segment order, stopping after `through_segment` if given.
pub fn simulate_with_rng<R: Rng>(
    circuit: &Circuit,
    through_segment: Option<i64>,
    rng: &mut R,
) -> Snapshot {
    let mut state = initial_state(circuit.num_bits);
    let mut measurements = HashMap::new();
    let mut last_segment: i64 = -1;
    let mut ops: Vec<&GateOp> = circuit.ops.iter().collect();
    ops.sort_by_key(|op| op.segment);
    for op in ops {
        if let Some(limit) = through_segment {
            if op.segment as i64 > limit {
                break;
            }
        }
        apply_op(&mut state, op, circuit.num_bits, &mut measurements, rng);
        last_segment = last_segment.max(op.segment as i64);
    }
    snapshot(&state, &measurements, circuit.num_bits, last_segment)
}

/// One-shot simulation seeded from OS/browser entropy.
pub fn simulate(circuit: &Circuit, through_segment: Option<i64>) -> Snapshot {
    simulate_with_rng(circuit, through_segment, &mut StdRng::from_os_rng())
}
