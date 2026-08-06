import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listCircuits, type SavedCircuit } from '../api/circuits';
import { listBlogs } from '../api/blogs';
import type { BlogPost } from '../types/blog';
import { CircuitThumbnail } from '../components/CircuitThumbnail';
import { QuantumField } from '../components/QuantumField';

const quickLinks = [
  { to: '/editor', icon: 'bi-pencil-square', label: 'Open editor', color: '#38bdf8' },
  { to: '/circuits', icon: 'bi-folder', label: 'My circuits', color: '#a78bfa' },
  { to: '/community', icon: 'bi-people', label: 'Community', color: '#34d399' },
  { to: '/account', icon: 'bi-person-gear', label: 'Account', color: '#fbbf24' },
];

export function HomePage() {
  const { user } = useAuth();
  const [circuits, setCircuits] = useState<SavedCircuit[] | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[] | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    listCircuits()
      .then((all) => setCircuits(all.slice(0, 3)))
      .catch(() => setCircuits([]));
    listBlogs()
      .then((all) => setBlogPosts(all.slice(0, 2)))
      .catch(() => setBlogPosts([]));
  }, []);

  return (
    <div className="home-page">
      <QuantumField />
      <div className="home-content">
        <div className="home-hero">
          <div className="home-avatar-ring">
            {user?.pfpUrl ? (
              <img src={user.pfpUrl} alt="" className="home-avatar" />
            ) : (
              <span className="home-avatar home-avatar-fallback">{user?.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 className="home-title">
              {greeting}, <span className="gradient-text">@{user?.username}</span>
            </h1>
            <p className="home-subtitle">Here’s what’s happening in your quantum lab today.</p>
          </div>
        </div>

        <div className="home-grid">
          <section className="home-card home-card-wide">
            <h2 className="home-card-title">
              <i className="bi bi-lightning-charge" /> Quick actions
            </h2>
            <div className="home-quick-links">
              {quickLinks.map((link) => (
                <Link key={link.to} to={link.to} className="home-quick-link" style={{ '--accent-color': link.color } as React.CSSProperties}>
                  <i className={`bi ${link.icon}`} />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="home-card">
            <h2 className="home-card-title">
              <i className="bi bi-folder" /> Recent circuits
            </h2>
            <div className="home-circuits">
              {circuits === null && <p className="home-muted">Loading…</p>}
              {circuits?.length === 0 && (
                <p className="home-muted">
                  No circuits yet.{' '}
                  <Link to="/editor" className="home-inline-link">
                    Build one now
                  </Link>
                  .
                </p>
              )}
              {circuits?.map((c) => (
                <Link key={c.id} to="/editor" state={{ circuit: c.circuit }} className="home-circuit-row">
                  <div className="home-circuit-thumb">
                    {c.thumbnailUrl ? (
                      <img src={c.thumbnailUrl} alt={c.name} />
                    ) : (
                      <CircuitThumbnail circuit={c.circuit} width={80} />
                    )}
                  </div>
                  <div className="home-circuit-meta">
                    <span className="home-circuit-name">{c.name}</span>
                    <span className="home-circuit-date">{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
            <Link to="/circuits" className="home-card-link">
              View all circuits <i className="bi bi-arrow-right" />
            </Link>
          </section>

          <section className="home-card">
            <h2 className="home-card-title">
              <i className="bi bi-journal-text" /> Latest from the blog
            </h2>
            <div className="home-blog-list">
              {blogPosts === null && <p className="home-muted">Loading…</p>}
              {blogPosts?.length === 0 && (
                <p className="home-muted">No blog posts yet.</p>
              )}
              {blogPosts?.map((post) => (
                <Link key={post.id} to={`/blog/${post.slug}`} className="home-blog-row">
                  <span className="home-blog-title">{post.title}</span>
                  <span className="home-blog-date">{new Date(post.created_at).toLocaleDateString()}</span>
                  <p
                    className="home-blog-excerpt"
                    dangerouslySetInnerHTML={{
                      __html: post.content.slice(0, 140) + (post.content.length > 140 ? '…' : ''),
                    }}
                  />
                </Link>
              ))}
            </div>
            <Link to="/blog" className="home-card-link">
              Read more <i className="bi bi-arrow-right" />
            </Link>
          </section>

          <section className="home-card home-card-wide">
            <h2 className="home-card-title">
              <i className="bi bi-megaphone" /> Patch notes
            </h2>
            <div className="home-patch-row">
              <span className="home-patch-version">v0.9.0</span>
              <span className="home-patch-badge feature">New</span>
              <span className="home-patch-text">Landing page, home dashboard, blog, and patch notes are live.</span>
              <Link to="/patch-notes" className="home-card-link">
                See all updates <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
