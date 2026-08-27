import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QuantumField } from '../components/QuantumField';
import { CircuitThumbnail } from '../components/CircuitThumbnail';
import { getTemplate } from '../api/templates';
import { sanitizeHtml } from '../utils/sanitize';
import { TEMPLATE_PREFETCH_KEY } from './templatePrefetch';
import type { TemplateDetail } from '../types/templates';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

export function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getTemplate(slug)
      .then(setTemplate)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load template')
      );
  }, [slug]);

  const openInEditor = () => {
    if (!template) return;
    sessionStorage.setItem(
      TEMPLATE_PREFETCH_KEY,
      JSON.stringify({ title: template.title, circuit: template.circuit })
    );
    navigate('/editor');
  };

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <Link to="/templates" className="home-card-link">
          <i className="bi bi-arrow-left" /> Back to templates
        </Link>

        {error && <div className="auth-message error">{error}</div>}
        {!template && !error && <p className="page-muted">Loading…</p>}

        {template && (
          <article className="blog-article">
            <div className="blog-article-meta">
              <span className="blog-tag">{template.category}</span>{' '}
              <span className="blog-status-badge">
                {DIFFICULTY_LABEL[template.difficulty]}
              </span>
              {!template.published && (
                <span className="blog-status-badge">Draft</span>
              )}
            </div>
            <h1 className="blog-article-title">{template.title}</h1>

            <button type="button" className="btn-primary" onClick={openInEditor}>
              Open in editor
            </button>

            <section className="template-preview">
              <CircuitThumbnail circuit={template.circuit} width={480} />
            </section>

            {/* Sanitized exactly like BlogPostPage sinks. */}
            <div
              className="blog-article-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(template.articleHtml) }}
            />
          </article>
        )}
      </div>
    </div>
  );
}
