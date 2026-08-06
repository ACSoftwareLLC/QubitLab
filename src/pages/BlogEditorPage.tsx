import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WysiwygEditor } from '../components/WysiwygEditor';
import { createBlog, getBlog, updateBlog } from '../api/blogs';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function BlogEditorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(slug);

  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [content, setContent] = useState('');
  const [published, setPublished] = useState(true);
  const [publishAt, setPublishAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getBlog(slug)
      .then((post) => {
        setTitle(post.title);
        setCustomSlug(post.slug);
        setContent(post.content);
        if (post.publish_at && post.published && new Date(post.publish_at) > new Date()) {
          setPublished(false);
          setPublishAt(toDatetimeLocal(new Date(post.publish_at)));
        } else {
          setPublished(post.published);
          setPublishAt('');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load post'));
  }, [slug]);

  const submit = async (publishNow: boolean) => {
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.');
      return;
    }

    const postSlug = customSlug.trim() || slugify(title);
    if (!postSlug) {
      setError('Please provide a valid slug or title.');
      return;
    }

    const publishAtIso = publishNow && publishAt.trim() ? new Date(publishAt).toISOString() : null;

    setSaving(true);
    try {
      if (isEdit && slug) {
        await updateBlog(slug, {
          slug: postSlug,
          title: title.trim(),
          content,
          published: publishNow,
          publishAt: publishAtIso,
        });
      } else {
        await createBlog({
          slug: postSlug,
          title: title.trim(),
          content,
          published: publishNow,
          publishAt: publishAtIso,
        });
      }
      navigate('/blog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(true);
  };

  const handleSaveDraft = () => {
    submit(false);
  };

  if (!user?.isAdmin) {
    return (
      <div className="content-page">
        <div className="content-page-body">
          <div className="auth-message error">Only admins can write blog posts.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-page">
      <div className="content-page-body">
        <div className="content-header">
          <h1 className="content-title">
            <i className="bi bi-pencil-square" /> {isEdit ? 'Edit post' : 'New blog post'}
          </h1>
        </div>

        <form className="blog-editor-form" onSubmit={handleSubmit}>
          {error && <div className="auth-message error">{error}</div>}

          <label className="auth-label" htmlFor="blog-title">
            Title
          </label>
          <input
            id="blog-title"
            className="auth-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            required
          />

          <label className="auth-label" htmlFor="blog-slug">
            Slug <span className="blog-optional">(auto-generated from title if empty)</span>
          </label>
          <input
            id="blog-slug"
            className="auth-input"
            type="text"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
            placeholder="my-awesome-post"
          />

          <label className="auth-label" htmlFor="blog-author">
            Author
          </label>
          <input
            id="blog-author"
            className="auth-input"
            type="text"
            value={user.displayName}
            readOnly
            disabled
          />

          <label className="auth-label">Content</label>
          <WysiwygEditor value={content} onChange={setContent} placeholder="Write something quantum…" />

          <label className="blog-checkbox">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => {
                setPublished(e.target.checked);
                if (e.target.checked) setPublishAt('');
              }}
            />
            Publish immediately
          </label>

          {!published && (
            <>
              <label className="auth-label" htmlFor="blog-publish-at">
                Publish at
              </label>
              <input
                id="blog-publish-at"
                className="auth-input"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
              <p className="blog-optional">Leave empty to save as a draft.</p>
            </>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel"
              onClick={() => navigate('/blog')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-cancel"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              Save as draft
            </button>
            <button type="submit" className="auth-submit modal-submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Update post' : 'Publish post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
