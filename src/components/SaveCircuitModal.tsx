import { useState, type FormEvent } from 'react';
import { useEditorActions } from '../context/EditorActionsContext';
import { createCircuit } from '../api/circuits';
import './AuthPage.css';

export function SaveCircuitModal({ onClose }: { onClose: () => void }) {
  const { actions } = useEditorActions();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!actions) return;
    setError(null);
    setSaving(true);
    try {
      const { circuit } = actions.serialize();
      const thumbnail = await actions.captureThumbnail();
      // Unconnected gates are simply not part of the serialized circuit.
      await createCircuit({ name: name.trim(), circuit, ...(thumbnail ? { thumbnail } : {}) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save circuit');
    } finally {
      setSaving(false);
    }
  };

  const unconnectedCount = actions ? actions.serialize().unconnectedGateIds.length : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-card modal-card" onClick={(e) => e.stopPropagation()}>
        <h1>Save circuit</h1>
        <p className="auth-subtitle">Give your circuit a name to save it to your account.</p>
        <form onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="circuit-name">
            Circuit name
          </label>
          <input
            id="circuit-name"
            className="auth-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            maxLength={80}
            autoFocus
          />
          {unconnectedCount > 0 && (
            <div className="auth-message error">
              {unconnectedCount} gate{unconnectedCount === 1 ? ' is' : 's are'} not connected to a
              bit line and will not be saved.
            </div>
          )}
          {error && <div className="auth-message error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="auth-submit modal-submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
