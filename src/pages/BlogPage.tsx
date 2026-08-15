import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listBlogs, deleteBlog } from '../api/blogs';
import type { BlogPost } from '../types/blog';
import { QuantumField } from '../components/QuantumField';
import { AuthorChip } from '../components/AuthorChip';
import { sanitizeHtmlForExcerpt } from '../utils/sanitize';

function isPublicPost(post: BlogPost): boolean {
  return post.published && (!post.publish_at || new Date(post.publish_at) <= new Date());
}

export function BlogPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listBlogs()
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load blog posts'));
  }, []);

  const handleDelete = async (slug: string) => {
    if (!window.confirm('Delete this post? It cannot be undone.')) return;
    setDeleting(slug);
    try {
      await deleteBlog(slug);
      setPosts((prev) => prev?.filter((p) => p.slug !== slug) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <div className="content-header">
          <h1 className="content-title">
            <i className="bi bi-journal-text" /> Blog
          </h1>
          <p className="content-subtitle">News, tutorials, and stories from the quantum party.</p>
          {user?.isAdmin && (
            <Link to="/blog/new" className="app-save-button" style={{ marginTop: '1rem', display: 'inline-flex' }}>
              <i className="bi bi-plus-lg" /> New post
            </Link>
          )}
        </div>

        {error && <div className="auth-message error">{error}</div>}

        {posts === null && !error && <p className="page-muted">Loading…</p>}

        {posts?.length === 0 && (
          <p className="page-muted">
            No posts yet. {user?.isAdmin && (
              <>
                <Link to="/blog/new" className="home-inline-link">Write the first one</Link>.
              </>
            )}
          </p>
        )}

        <div className="blog-list">
          {posts?.map((post, index) => {
            const visible = isPublicPost(post);
            const scheduled = post.published && post.publish_at && !visible;
            return (
              <article
                key={post.id}
                className={`blog-card ${user?.isAdmin && !visible ? 'blog-card-unpublished' : ''}`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="blog-card-meta">
                  <span className="blog-card-date">{new Date(post.created_at).toLocaleDateString()}</span>
                  {post.authorProfile ? (
                    <AuthorChip
                      username={post.authorProfile.username}
                      displayName={post.authorProfile.displayName}
                      pfpUrl={post.authorProfile.pfpUrl}
                      isAdmin={post.authorProfile.isAdmin}
                    />
                  ) : (
                    <span className="blog-card-author">by {post.author}</span>
                  )}
                  {user?.isAdmin && !visible && (
                    <span className="blog-status-badge">
                      {scheduled ? 'Scheduled' : 'Draft'}
                    </span>
                  )}
                </div>
                <h2 className="blog-card-title">{post.title}</h2>
              <div
                className="blog-card-excerpt"
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlForExcerpt(post.content, 300) }}
              />
              <div className="blog-card-actions">
                <Link to={`/blog/${post.slug}`} className="blog-read-link">
                  Read more <i className="bi bi-arrow-right" />
                </Link>
                {user?.isAdmin && (
                  <div className="blog-admin-actions">
                    <Link to={`/blog/${post.slug}/edit`} className="blog-admin-btn">
                      <i className="bi bi-pencil" /> Edit
                    </Link>
                    <button
                      className="blog-admin-btn danger"
                      onClick={() => handleDelete(post.slug)}
                      disabled={deleting === post.slug}
                    >
                      <i className="bi bi-trash" /> {deleting === post.slug ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
