//! Interactive stepping session — port of the Python `StepSession` that
//! backed the WebSocket endpoint. Runs locally in the browser now.

use std::collections::{HashMap, HashSet};

use num_complex::Complex64;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

use crate::engine::{
    api_to_internal, apply_op, initial_state, measure, snapshot, Snapshot,
};
use crate::model::{Circuit, GateOp};

pub struct StepSession<R: Rng> {
    circuit: Circuit,
    num_bits: usize,
    segments: Vec<usize>,
    cursor: i64,
    state: Vec<Complex64>,
    measurements: HashMap<u64, u8>,
    rng: R,
}

impl StepSession<StdRng> {
    /// Session with measurement sampling seeded from OS/browser entropy.
    pub fn new(circuit: Circuit) -> Self {
        Self::with_rng(circuit, StdRng::from_os_rng())
    }
}

impl<R: Rng> StepSession<R> {
    pub fn with_rng(circuit: Circuit, rng: R) -> Self {
        let num_bits = circuit.num_bits;
        let mut segments: Vec<usize> = circuit
            .ops
            .iter()
            .map(|op| op.segment)
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        segments.sort_unstable();
        Self {
            circuit,
            num_bits,
            segments,
            cursor: -1,
            state: initial_state(num_bits),
            measurements: HashMap::new(),
            rng,
        }
    }

    pub fn num_steps(&self) -> usize {
        self.segments.len()
    }

    pub fn cursor(&self) -> i64 {
        self.cursor
    }

    pub fn measurements(&self) -> &HashMap<u64, u8> {
        &self.measurements
    }

    pub fn snapshot(&self) -> Snapshot {
        snapshot(&self.state, &self.measurements, self.num_bits, self.cursor)
    }

    fn apply_segment(&mut self, segment: usize) {
        for i in 0..self.circuit.ops.len() {
            if self.circuit.ops[i].segment == segment {
                let op = self.circuit.ops[i].clone();
                apply_op(
                    &mut self.state,
                    &op,
                    self.num_bits,
                    &mut self.measurements,
                    &mut self.rng,
                );
            }
        }
    }

    /// Advance one segment; returns None when already at the end.
    pub fn step(&mut self) -> Option<Snapshot> {
        let next = self
            .segments
            .iter()
            .copied()
            .find(|&s| s as i64 > self.cursor)?;
        self.cursor = next as i64;
        self.apply_segment(next);
        Some(self.snapshot())
    }

    pub fn run(&mut self) -> Snapshot {
        while self.step().is_some() {}
        self.snapshot()
    }

    pub fn reset(&mut self) -> Snapshot {
        self.cursor = -1;
        self.state = initial_state(self.num_bits);
        self.measurements.clear();
        self.snapshot()
    }

    /// State as of `segment` without moving the cursor.
    ///
    /// Re-simulates from scratch; measurement ops already observed in this
    /// session keep their recorded outcome so peeks stay consistent.
    pub fn peek(&mut self, segment: i64) -> Snapshot {
        let mut state = initial_state(self.num_bits);
        let mut measurements = self.measurements.clone();
        let mut seen: HashMap<u64, u8> = HashMap::new();
        let mut ops: Vec<&GateOp> = self.circuit.ops.iter().collect();
        ops.sort_by_key(|op| op.segment);
        for op in ops {
            if op.segment as i64 > segment {
                break;
            }
            if op.op_type == "M" {
                measure(
                    &mut state,
                    api_to_internal(op.targets[0], self.num_bits),
                    &mut self.rng,
                    &mut measurements,
                    op.id,
                );
                seen.insert(op.id, measurements[&op.id]);
            } else {
                apply_op(&mut state, op, self.num_bits, &mut seen, &mut self.rng);
            }
        }
        snapshot(&state, &seen, self.num_bits, segment)
    }
}
