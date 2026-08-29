import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../../api/types";
import { circuitToQasm, qasmToCircuit } from "./qasm";

/**
 * Export/Import modal for OPENQASM 2.0. Export shows generated QASM with
 * copy and download actions; import parses pasted QASM, surfacing line-
 * numbered errors from the codec.
 */

interface QasmDialogProps {
  circuit: Circuit;
  /** Replaces the editor document on successful import. */
  onImport: (circuit: Circuit) => void;
  onClose: () => void;
}

export function QasmDialog({ circuit, onImport, onClose }: QasmDialogProps) {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [importText, setImportText] = useState("");
  const [errors, setErrors] = useState<string[] | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  const exported = circuitToQasm(circuit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context): silent.
    }
  };

  const download = () => {
    const blob = new Blob([exported], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "circuit.qasm";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = () => {
    const result = qasmToCircuit(importText);
    if ("circuit" in result) {
      if (result.warnings.length > 0) {
        // Import succeeds; keep the dialog open so the user sees the
        // warnings, then import on explicit continue.
        setWarnings(result.warnings);
        return;
      }
      onImport(result.circuit);
      onClose();
      return;
    }
    setErrors(result.errors);
  };
  return (
    <div className="ev2-qasm-overlay" onClick={onClose}>
      <div className="ev2-qasm-card" onClick={(e) => e.stopPropagation()}>
        <div className="ev2-qasm-header">
          <span className="ev2-qasm-title">OPENQASM 2.0</span>
          <div className="ev2-qasm-tabs">
            <button
              type="button"
              className={`ev2-qasm-tab${tab === "export" ? " active" : ""}`}
              onClick={() => setTab("export")}
            >
              Export
            </button>
            <button
              type="button"
              className={`ev2-qasm-tab${tab === "import" ? " active" : ""}`}
              onClick={() => setTab("import")}
            >
              Import
            </button>
          </div>
          <button
            type="button"
            className="ev2-qasm-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x" />
          </button>
        </div>

        {tab === "export" ? (
          <>
            <textarea
              className="ev2-qasm-textarea"
              readOnly
              value={exported}
              spellCheck={false}
            />
            <div className="ev2-qasm-actions">
              <button type="button" className="ev2-chip-btn" onClick={copy}>
                <i
                  className={`bi ${copied ? "bi-clipboard-check" : "bi-clipboard"}`}
                />
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="ev2-chip-btn" onClick={download}>
                <i className="bi bi-download" />
                Download .qasm
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              className="ev2-qasm-textarea"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setErrors(null);
                setWarnings(null);
              }}
              placeholder={
                'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];'
              }
              spellCheck={false}
            />
            {errors && (
              <ul className="ev2-qasm-errors">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
            {warnings && (
              <div className="ev2-qasm-warnings">
                <div className="ev2-qasm-warning-title">
                  <i className="bi bi-exclamation-triangle" /> Import succeeded
                  with warnings
                </div>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <div className="ev2-qasm-actions">
                  <button
                    type="button"
                    className="ev2-chip-btn ev2-chip-primary"
                    onClick={() => {
                      const result = qasmToCircuit(importText);
                      if ("circuit" in result) {
                        onImport(result.circuit);
                        onClose();
                      }
                    }}
                  >
                    <i className="bi bi-box-arrow-in-down" />
                    Continue
                  </button>
                </div>
              </div>
            )}
            {!warnings && (
              <div className="ev2-qasm-actions">
                <button
                  type="button"
                  className="ev2-chip-btn ev2-chip-primary"
                  onClick={runImport}
                  disabled={!importText.trim()}
                >
                  <i className="bi bi-box-arrow-in-down" />
                  Import
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
