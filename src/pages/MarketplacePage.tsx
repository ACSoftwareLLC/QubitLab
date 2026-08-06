import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMarketplace, type SavedCircuit } from '../api/circuits';
import { CircuitThumbnail } from '../components/CircuitThumbnail';
import '../components/AuthPage.css';

export function MarketplacePage() {
  const navigate = useNavigate();
  const [circuits, setCircuits] = useState<SavedCircuit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMarketplace()
      .then(setCircuits)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load marketplace'));
  }, []);

  const handleOpen = (circuit: SavedCircuit) => {
    navigate('/editor', { state: { circuit: circuit.circuit } });
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <h1 className="page-title">Marketplace</h1>
        <p className="auth-subtitle">Discover public circuits shared by the community.</p>

        {error && <div className="auth-message error">{error}</div>}

        {circuits === null && !error && <p className="page-muted">Loading…</p>}

        {circuits !== null && circuits.length === 0 && (
          <p className="page-muted">No shared circuits yet — be the first to share one from My Circuits.</p>
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
                  Shared {new Date(circuit.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
