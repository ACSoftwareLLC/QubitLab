import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuantumField } from '../components/QuantumField';
import { fetchStats, type SiteStats } from '../api/stats';

function formatStat(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

const features = [
  {
    icon: 'bi-cpu',
    title: 'Visual Quantum Editor',
    description: 'Drag, drop, and wire quantum gates on an infinite canvas. No equations required to start exploring.',
  },
  {
    icon: 'bi-share',
    title: 'Share & Remix',
    description: 'Publish your circuits to the Community and remix shared designs to learn new tricks.',
  },
  {
    icon: 'bi-lightning-charge',
    title: 'Real-time Simulation',
    description: 'Watch state vectors evolve as you step through your circuit, powered by a Rust/WASM simulator.',
  },
  {
    icon: 'bi-people',
    title: 'Built for Teams',
    description: 'Save your work, track versions, and collaborate on quantum experiments with your party.',
  },
];

export function LandingPage() {
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => setStats({ users: 0, circuits: 0, shared: 0, sharedThisWeek: 0 }));
  }, []);

  return (
    <div className="landing-page">
      <QuantumField />
      <div className="landing-hero">
        <div className="landing-badge">
          <i className="bi bi-stars" /> QubitLab is now in open beta
        </div>
        <h1 className="landing-title">
          Build quantum circuits
          <br />
          <span className="gradient-text">like you’re playing a game.</span>
        </h1>
        <p className="landing-subtitle">
          A playful, collaborative space to design, simulate, and share quantum circuits —
          whether you’re a curious beginner or a qubit wizard.
        </p>
        <div className="landing-actions">
          <Link to="/login" className="landing-btn landing-btn-primary">
            <i className="bi bi-rocket-takeoff" /> Start building
          </Link>
          <Link to="/blog" className="landing-btn landing-btn-secondary">
            <i className="bi bi-journal-text" /> Read the blog
          </Link>
        </div>
        <div className="landing-stats">
          <div className="landing-stat">
            <span className="landing-stat-value">{formatStat(stats?.circuits)}</span>
            <span className="landing-stat-label">Circuits designed</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">{formatStat(stats?.shared)}</span>
            <span className="landing-stat-label">Community shares</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">{formatStat(stats?.users)}</span>
            <span className="landing-stat-label">Registered users</span>
          </div>
        </div>
      </div>

      <div className="landing-features">
        <h2 className="landing-section-title">Everything you need to play with qubits</h2>
        <div className="landing-feature-grid">
          {features.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-icon">
                <i className={`bi ${f.icon}`} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-cta">
        <div className="landing-cta-glow" />
        <h2>Ready to roll the quantum dice?</h2>
        <p>Create a free account and start designing your first circuit in seconds.</p>
        <Link to="/login" className="landing-btn landing-btn-primary">
          <i className="bi bi-person-plus" /> Create free account
        </Link>
      </div>

      <footer className="landing-footer">
        <div className="landing-footer-links">
          <Link to="/blog">Blog</Link>
          <Link to="/patch-notes">Patch notes</Link>
          <Link to="/login">Sign in</Link>
        </div>
        <span className="landing-footer-copy">© {new Date().getFullYear()} QubitLab</span>
      </footer>
    </div>
  );
}
