import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCircuits, deleteCircuit, type SavedCircuit } from '../api/circuits';
import { CircuitThumbnail } from '../components/CircuitThumbnail';
import '../components/AuthPage.css';

export function CircuitsPage() {
  const navigate = useNavigate();
  const [circuits, setCircuits] = useState<SavedCircuit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCircuits()
      .then(setCircuits)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load circuits'));
  }, []);

  const handleDelete = async (e: React.MouseEvent, circuit: SavedCircuit) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${circuit.name}"? This cannot be undone.`)) return;
    try {
      await deleteCircuit(circuit.id);
      setCircuits((prev) => prev?.filter((c) => c.id !== circuit.id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete circuit');
    }
  };

  const handleOpen = (circuit: SavedCircuit) => {
    navigate('/editor', { state: { circuit: circuit.circuit } });
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <h1 className="page-title">My circuits</h1>
        <p className="auth-subtitle">Your saved circuits — click one to open it in the editor.</p>

        {error && <div className="auth-message error">{error}</div>}

        {circuits === null && !error && <p className="page-muted">Loading…</p>}

        {circuits !== null && circuits.length === 0 && (
          <p className="page-muted">No saved circuits yet — design one in the editor and hit Save.</p>
        )}

        <div className="circuit-grid">
          {circuits?.map((circuit) => (
            <div
              key={circuit.id}
              className="circuit-card"
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(circuit)}
              onKeyDown={(e) => e.key === 'Enter' && handleOpen(circuit)}
            >
              <div className="circuit-thumb">
                {circuit.thumbnailUrl ? (
                  <img src={circuit.thumbnailUrl} alt={circuit.name} />
                ) : (
                  <CircuitThumbnail circuit={circuit.circuit} width={240} />
                )}
              </div>
              <div className="circuit-meta">
                <span className="circuit-name">{circuit.name}</span>
                <span className="circuit-detail">@{circuit.username}</span>
                <span className="circuit-detail">
                  Modified {new Date(circuit.updatedAt).toLocaleString()}
                </span>
              </div>
              <button
                className="circuit-delete"
                onClick={(e) => handleDelete(e, circuit)}
                aria-label={`Delete ${circuit.name}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
