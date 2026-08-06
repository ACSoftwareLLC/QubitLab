//! Circuit JSON model: loose (serde_json::Value) parsing that mirrors the
//! Python backend's `.get()` semantics, plus the validated typed form the
//! engine consumes.

use serde_json::Value;

use crate::validate::{validate, ValidationError};

/// A single gate operation, validated and typed.
#[derive(Debug, Clone)]
pub struct GateOp {
    pub id: u64,
    pub op_type: String,
    pub segment: usize,
    pub targets: Vec<usize>,
    pub controls: Vec<usize>,
    pub angle: Option<f64>,
}

/// A validated circuit ready for simulation.
#[derive(Debug, Clone)]
pub struct Circuit {
    pub num_bits: usize,
    pub ops: Vec<GateOp>,
}

/// Validate `value`, and if valid convert it to the typed `Circuit`.
/// Returns the validation errors otherwise (same payload as `validate`).
pub fn parse_circuit(value: &Value) -> Result<Circuit, Vec<ValidationError>> {
    let errors = validate(value);
    if !errors.is_empty() {
        return Err(errors);
    }
    Ok(to_typed(value))
}

/// Convert a known-valid circuit JSON into the typed form. Field extraction
/// repeats the same lenient lookups as validation, so every `unwrap` below is
/// backed by a check that already passed.
fn to_typed(value: &Value) -> Circuit {
    let num_bits = value.get("numBits").and_then(Value::as_u64).unwrap() as usize;
    let ops = value
        .get("ops")
        .and_then(Value::as_array)
        .map(|ops| {
            ops.iter()
                .map(|op| GateOp {
                    id: op.get("id").and_then(Value::as_u64).unwrap_or(0),
                    op_type: op
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    segment: op.get("segment").and_then(Value::as_i64).unwrap_or(0) as usize,
                    targets: bit_list(op.get("targets")),
                    controls: bit_list(op.get("controls")),
                    angle: op.get("angle").and_then(Value::as_f64),
                })
                .collect()
        })
        .unwrap_or_default();
    Circuit { num_bits, ops }
}

fn bit_list(value: Option<&Value>) -> Vec<usize> {
    value
        .and_then(Value::as_array)
        .map(|bits| {
            bits.iter()
                .filter_map(|b| b.as_u64().map(|b| b as usize))
                .collect()
        })
        .unwrap_or_default()
}

/// Python `repr()`-ish rendering for error messages, matching the strings the
/// Python backend produced (e.g. `unknown gate type 'FOO'`).
pub fn py_repr(value: &Value) -> String {
    match value {
        Value::Null => "None".to_string(),
        Value::Bool(b) => if *b { "True" } else { "False" }.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{s}'"),
        other => other.to_string(),
    }
}
