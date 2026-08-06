//! wasm-bindgen facade. Payloads cross the JS boundary as JSON strings:
//! `serde_json` handles integral numbers exactly (canvas op ids are large
//! timestamps), and the TS wrapper in `src/api/wasm.ts` does
//! stringify/parse. Functions never throw for expected failures — validation
//! problems are returned in the payload.

use rand::rngs::StdRng;
use serde_json::{json, Value};
use wasm_bindgen::prelude::*;

use crate::engine::{simulate, Snapshot};
use crate::model::parse_circuit;
use crate::session::StepSession;
use crate::validate::{validate, ValidationError, ValidationResult};

fn malformed_json(error: serde_json::Error) -> ValidationError {
    ValidationError {
        op_id: None,
        message: format!("malformed circuit JSON: {error}"),
    }
}

/// Returns a `ValidationResult` JSON string: {"valid": bool, "errors": [...]}.
#[wasm_bindgen(js_name = "validateCircuit")]
pub fn validate_circuit(circuit_json: &str) -> String {
    let result = match serde_json::from_str::<Value>(circuit_json) {
        Ok(value) => {
            let errors = validate(&value);
            ValidationResult {
                valid: errors.is_empty(),
                errors,
            }
        }
        Err(e) => ValidationResult {
            valid: false,
            errors: vec![malformed_json(e)],
        },
    };
    serde_json::to_string(&result).unwrap()
}

/// Returns `{"ok": <Snapshot>}` on success or `{"errors": [...]}` when the
/// circuit is invalid (the old backend's 422 payload).
#[wasm_bindgen(js_name = "simulateCircuit")]
pub fn simulate_circuit(circuit_json: &str, through_segment: Option<i32>) -> String {
    let value = match serde_json::from_str::<Value>(circuit_json) {
        Ok(value) => value,
        Err(e) => return json!({ "errors": [malformed_json(e)] }).to_string(),
    };
    match parse_circuit(&value) {
        Ok(circuit) => {
            let snapshot = simulate(&circuit, through_segment.map(i64::from));
            json!({ "ok": snapshot }).to_string()
        }
        Err(errors) => json!({ "errors": errors }).to_string(),
    }
}

/// Interactive stepping session (formerly the /ws/simulate WebSocket handler).
#[wasm_bindgen]
pub struct WasmSession {
    inner: StepSession<StdRng>,
}

#[wasm_bindgen]
impl WasmSession {
    /// Throws a JSON string of the validation-error list on invalid circuits.
    #[wasm_bindgen(constructor)]
    pub fn new(circuit_json: &str) -> Result<WasmSession, JsValue> {
        let value: Value = serde_json::from_str(circuit_json)
            .map_err(|e| JsValue::from_str(&format!("malformed circuit JSON: {e}")))?;
        let circuit = parse_circuit(&value)
            .map_err(|errors| JsValue::from_str(&serde_json::to_string(&errors).unwrap()))?;
        Ok(Self {
            inner: StepSession::new(circuit),
        })
    }

    #[wasm_bindgen(getter, js_name = "numSteps")]
    pub fn num_steps(&self) -> usize {
        self.inner.num_steps()
    }

    /// Snapshot JSON string of the next segment, or null when at the end.
    pub fn step(&mut self) -> JsValue {
        match self.inner.step() {
            Some(snapshot) => JsValue::from_str(&serialize(&snapshot)),
            None => JsValue::NULL,
        }
    }

    pub fn run(&mut self) -> String {
        serialize(&self.inner.run())
    }

    pub fn reset(&mut self) -> String {
        serialize(&self.inner.reset())
    }

    pub fn peek(&mut self, segment: i32) -> String {
        serialize(&self.inner.peek(i64::from(segment)))
    }

    pub fn snapshot(&self) -> String {
        serialize(&self.inner.snapshot())
    }
}

fn serialize(snapshot: &Snapshot) -> String {
    serde_json::to_string(snapshot).unwrap()
}
