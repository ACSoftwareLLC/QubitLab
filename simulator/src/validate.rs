//! Structural circuit validation — an exact port of the Python backend's
//! rules and error-message strings.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use crate::model::py_repr;
use crate::{MAX_BITS, NUM_SEGMENTS};

pub const SINGLE_QUBIT_GATES: &[&str] = &["H", "X", "Y", "Z", "S", "T", "Sdg", "Tdg", "SX", "I"];
pub const PARAMETERIZED_GATES: &[&str] = &["Rx", "Ry", "Rz", "P"];
pub const MULTI_QUBIT_GATES: &[&str] = &["C", "CX", "CZ", "CCX", "SWAP", "M"];

pub fn is_known_gate(op_type: &str) -> bool {
    SINGLE_QUBIT_GATES.contains(&op_type)
        || PARAMETERIZED_GATES.contains(&op_type)
        || MULTI_QUBIT_GATES.contains(&op_type)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ValidationError {
    #[serde(rename = "opId")]
    pub op_id: Option<u64>,
    pub message: String,
}

impl ValidationError {
    fn new(op_id: Option<u64>, message: String) -> Self {
        Self { op_id, message }
    }
}

#[derive(Debug, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

/// Returns a list of {opId, message} errors; empty means valid.
pub fn validate(circuit: &Value) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    let num_bits = match circuit.get("numBits").and_then(Value::as_u64) {
        Some(n) if (1..=MAX_BITS as u64).contains(&n) => n as usize,
        _ => {
            errors.push(ValidationError::new(
                None,
                format!("numBits must be an int in 1..{MAX_BITS}"),
            ));
            return errors; // nothing else is checkable
        }
    };

    let no_ops: Vec<Value> = Vec::new();
    let ops = circuit.get("ops").and_then(Value::as_array).unwrap_or(&no_ops);

    for op in ops {
        let op_id = op.get("id").and_then(Value::as_u64);
        let type_value = op.get("type").cloned().unwrap_or(Value::Null);
        let op_type = match type_value.as_str() {
            Some(t) if is_known_gate(t) => t,
            _ => {
                errors.push(ValidationError::new(
                    op_id,
                    format!("unknown gate type {}", py_repr(&type_value)),
                ));
                continue;
            }
        };

        match op.get("segment").and_then(Value::as_i64) {
            Some(s) if (0..NUM_SEGMENTS).contains(&s) => {}
            _ => errors.push(ValidationError::new(
                op_id,
                format!("segment must be an int in 0..{}", NUM_SEGMENTS - 1),
            )),
        }

        let no_bits: Vec<Value> = Vec::new();
        let targets = op.get("targets").and_then(Value::as_array).unwrap_or(&no_bits);
        let controls = op.get("controls").and_then(Value::as_array).unwrap_or(&no_bits);

        for (bits, label) in [(targets, "target"), (controls, "control")] {
            for b in bits {
                match b.as_u64() {
                    Some(bi) if (bi as usize) < num_bits => {}
                    _ => errors.push(ValidationError::new(
                        op_id,
                        format!("{label} bit {} out of range 0..{}", py_repr(b), num_bits - 1),
                    )),
                }
            }
        }

        let target_set: HashSet<u64> = targets.iter().filter_map(Value::as_u64).collect();
        let control_set: HashSet<u64> = controls.iter().filter_map(Value::as_u64).collect();
        if !target_set.is_disjoint(&control_set) {
            errors.push(ValidationError::new(
                op_id,
                "a bit cannot be both target and control".to_string(),
            ));
        }

        if PARAMETERIZED_GATES.contains(&op_type) && op.get("angle").is_none_or(Value::is_null) {
            errors.push(ValidationError::new(
                op_id,
                format!("{op_type} requires an angle (radians)"),
            ));
        }
        if matches!(op_type, "C" | "CX" | "CZ") && (targets.len() != 1 || controls.len() != 1) {
            errors.push(ValidationError::new(
                op_id,
                format!("{op_type} requires exactly 1 target and 1 control"),
            ));
        }
        if op_type == "CCX" && (targets.len() != 1 || controls.len() != 2) {
            errors.push(ValidationError::new(
                op_id,
                "CCX requires exactly 1 target and 2 controls".to_string(),
            ));
        }
        if op_type == "SWAP" && targets.len() != 2 {
            errors.push(ValidationError::new(
                op_id,
                "SWAP requires exactly 2 targets".to_string(),
            ));
        }
        if (SINGLE_QUBIT_GATES.contains(&op_type)
            || PARAMETERIZED_GATES.contains(&op_type)
            || op_type == "M")
            && targets.len() != 1
        {
            errors.push(ValidationError::new(
                op_id,
                format!("{op_type} requires exactly 1 target"),
            ));
        }
    }
    errors
}
