import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBlog } from '../api/blogs';
import type { BlogPost } from '../types/blog';
import { QuantumField } from '../components/QuantumField';
import { AuthorChip } from '../components/AuthorChip';

function isPublicPost(post: BlogPost): boolean {
  return post.published && (!post.publish_at || new Date(post.publish_at) <= new Date());
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getBlog(slug)
      .then(setPost)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load post'));
  }, [slug]);

  return (
    <div className="content-page">
      <QuantumField />
      <div className="content-page-body">
        <Link to="/blog" className="home-card-link">
          <i className="bi bi-arrow-left" /> Back to blog
        </Link>

        {error && <div className="auth-message error" style={{ marginTop: '1rem' }}>{error}</div>}

        {!post && !error && <p className="page-muted">Loading…</p>}

          {post && (
          <article className={`blog-article ${user?.isAdmin && !isPublicPost(post) ? 'blog-article-unpublished' : ''}`}>
            <div className="blog-article-meta">
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
              {post.authorProfile ? (
                <AuthorChip
                  username={post.authorProfile.username}
                  displayName={post.authorProfile.displayName}
                  pfpUrl={post.authorProfile.pfpUrl}
                  isAdmin={post.authorProfile.isAdmin}
                />
              ) : (
                <span>by {post.author}</span>
              )}
              {user?.isAdmin && !isPublicPost(post) && (
                <span className="blog-status-badge">
                  {post.published && post.publish_at ? 'Scheduled' : 'Draft'}
                </span>
              )}
            </div>
            <h1 className="blog-article-title">{post.title}</h1>
            {user?.isAdmin && (
              <div className="blog-admin-actions" style={{ marginBottom: '1.5rem' }}>
                <Link to={`/blog/${post.slug}/edit`} className="blog-admin-btn">
                  <i className="bi bi-pencil" /> Edit
                </Link>
              </div>
            )}
            <div
              className="blog-article-content"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        )}
      </div>
    </div>
  );
}
