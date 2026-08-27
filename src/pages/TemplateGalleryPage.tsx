import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuantumField } from '../components/QuantumField';
import { listTemplates } from '../api/templates';
import type { TemplateSummary } from '../types/templates';

// Duplicated from the worker's zod category enum: the frontend must not import
// worker code, so this presentational list is intentionally local.
const CATEGORIES = [
  'all',
  'foundations',
  'algorithm',
  'entanglement',
  'games',
] as const;

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

export function TemplateGalleryPage() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>('all');

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load templates')
      );
  }, []);

  const visible = useMemo(
    () =>
      (templates ?? []).filter((t) => filter === 'all' || t.category === filter),
    [templates, filter]
  );

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <div className="content-header">
          <h1 className="content-title">Templates</h1>
          <p className="content-subtitle">
            Ready-to-run circuits with guided explanations. Open one and press
            Simulate.
          </p>
        </div>

        <nav className="template-filters" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`template-filter-chip${filter === cat ? ' active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>

        {error && <div className="auth-message error">{error}</div>}
        {!templates && !error && <p className="page-muted">Loading…</p>}
        {templates && visible.length === 0 && (
          <p className="page-muted">No templates yet.</p>
        )}

        <div className="circuit-grid">
          {visible.map((t) => (
            <div key={t.id} className="circuit-card">
              <Link
                to={`/templates/${t.slug}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  padding: '1rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  height: '100%',
                }}
              >
                <span className="circuit-name">{t.title}</span>
                <span className="circuit-detail">{t.description}</span>
                <span className="blog-card-tags">
                  <span className="blog-tag">{t.category}</span>{' '}
                  <span className="blog-status-badge">
                    {DIFFICULTY_LABEL[t.difficulty]}
                  </span>
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
