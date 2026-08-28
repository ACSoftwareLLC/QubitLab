//! Quantum-Dnd statevector simulator.
//!
//! Rust/WASM port of the former Python backend (`server/simulator.py`, Qiskit
//! based). The pure-Rust core (`validate`, `simulate`, `StepSession`) is
//! target-independent and unit-tested with `cargo test`; `wasm` exposes the
//! same API to JavaScript via wasm-bindgen.
//!
//! Conventions (see docs/api.md):
//! - basis strings have qubit 0 leftmost; internally the statevector index is
//!   little-endian, so API wire i maps to internal bit (num_bits - 1 - i).
//! - snapshots are sparse: amplitudes with prob < EPS are omitted.

pub mod engine;
pub mod model;
pub mod session;
pub mod validate;
mod wasm;

pub use engine::{simulate, simulate_with_rng, Snapshot, StatevectorEntry};
pub use model::{parse_circuit, Circuit, GateOp};
pub use session::StepSession;
pub use validate::{validate, ValidationError, ValidationResult};

pub const EPS: f64 = 1e-6;
pub const MAX_BITS: usize = 16;
pub const NUM_SEGMENTS: i64 = 1024;
