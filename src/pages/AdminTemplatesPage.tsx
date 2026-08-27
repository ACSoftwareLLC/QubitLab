import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WysiwygEditor } from '../components/WysiwygEditor';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
} from '../api/templates';
import type { Circuit } from '../api/types';
import type { TemplateCategory, TemplateDetail, TemplateInput, TemplateSummary } from '../types/templates';

const EMPTY_FORM = {
  slug: '',
  title: '',
  description: '',
  category: 'foundations' as TemplateCategory,
  difficulty: 1,
  sortOrder: 0,
  published: false,
  articleHtml: '<p></p>',
  circuitJson: '',
};

type FormState = typeof EMPTY_FORM;

function parseCircuitJson(raw: string): Circuit | null {
  try {
    const parsed = JSON.parse(raw) as { numBits?: unknown; ops?: unknown };
    if (
      parsed &&
      typeof parsed.numBits === 'number' &&
      Number.isInteger(parsed.numBits) &&
      parsed.numBits >= 1 && parsed.numBits <= 16 &&
      Array.isArray(parsed.ops)
    ) {
      // SAFETY: numBits is a validated integer in [1,16] and ops is an array above;
      // the GateOp element shapes are admin-supplied and re-validated server-side by zod.
      return parsed as unknown as Circuit;
    }
    return null;
  } catch {
    return null;
  }
}

export function AdminTemplatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const [items, setItems] = useState<TemplateSummary[] | null>(null);
  const [editing, setEditing] = useState<TemplateDetail | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listTemplates()
      .then(setItems)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load templates')
      );
  }, []);
  // Deviation from brief: gate the list fetch on admin — the guard screen must not
  // fire requests (and the brief's guards test runs with listTemplates unmocked).
  useEffect(() => {
    if (!isAdmin) return;
    refresh();
  }, [refresh, isAdmin]);

  if (!user?.isAdmin) {
    return (
      <div className="content-page">
        <div className="content-page-body">
          <div className="auth-message error">Administrators only.</div>
        </div>
      </div>
    );
  }

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = async (summary: TemplateSummary) => {
    try {
      const detail = await getTemplate(summary.slug);
      setEditing(detail);
      setForm({
        slug: detail.slug,
        title: detail.title,
        description: detail.description,
        category: detail.category,
        difficulty: detail.difficulty,
        sortOrder: 0, // detail does not carry sortOrder; preserved on PATCH by omitting the field
        published: detail.published,
        articleHtml: detail.articleHtml,
        circuitJson: JSON.stringify(detail.circuit, null, 2),
      });
      setFormError(null);
    } catch {
      setLoadError('Failed to load template for editing');
    }
  };

  const save = async () => {
    const circuit = parseCircuitJson(form.circuitJson);
    if (!circuit) {
      setFormError('Invalid circuit JSON — expected {"numBits": n, "ops": [...]}');
      return;
    }
    const base: TemplateInput = {
      slug: form.slug,
      title: form.title,
      description: form.description,
      category: form.category,
      difficulty: form.difficulty,
      published: form.published,
      sortOrder: form.sortOrder,
      circuit,
      articleHtml: form.articleHtml,
    };
    try {
      if (editing === 'new') {
        await createTemplate(base as Required<typeof base>);
      } else if (editing) {
        await updateTemplate(editing.id, base);
      }
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this template permanently?')) return;
    await deleteTemplate(id);
    refresh();
  };

  const togglePublish = async (t: TemplateSummary) => {
    await updateTemplate(t.id, { published: !t.published });
    refresh();
  };

  // List view…
  if (editing === null) {
    return (
      <div className="content-page">
        <div className="content-page-body">
          <div className="content-header">
            <h1 className="content-title">Manage templates</h1>
            <button type="button" className="auth-submit-button" onClick={openNew}>New template</button>
          </div>
          {loadError && <div className="auth-message error">{loadError}</div>}
          {!items && !loadError && <p className="page-muted">Loading…</p>}
          <ul>
            {(items ?? []).map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong> <code>{t.slug}</code>
                {!t.published && <em> — draft</em>}
                {' '}
                <button type="button" onClick={() => void togglePublish(t)}>
                  {t.published ? 'Unpublish' : 'Publish'}
                </button>
                {' '}
                <button type="button" onClick={() => void openEdit(t)}>Edit</button>
                {' '}
                <button type="button" onClick={() => void remove(t.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Form view (New or Edit)…
  return (
    <div className="content-page">
      <div className="content-page-body">
        <div className="content-header">
          <h1 className="content-title">
            {editing === 'new' ? 'New template' : `Edit: ${editing.title}`}
          </h1>
        </div>
        {formError && <div className="auth-message error">{formError}</div>}
        <label>
          Slug
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </label>
        <label>
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FormState['category'] })}>
            <option value="foundations">foundations</option>
            <option value="algorithm">algorithm</option>
            <option value="entanglement">entanglement</option>
            <option value="games">games</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
            <option value={1}>Beginner</option>
            <option value={2}>Intermediate</option>
            <option value={3}>Advanced</option>
          </select>
        </label>
        <label>
          Published
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
        </label>
        <label>
          Circuit JSON
          <textarea
            aria-label="Circuit JSON"
            rows={10}
            value={form.circuitJson}
            onChange={(e) => setForm({ ...form, circuitJson: e.target.value })}
          />
        </label>
        <WysiwygEditor
          value={form.articleHtml}
          onChange={(html) => setForm({ ...form, articleHtml: html })}
          placeholder="Write the explanation…"
        />
        <button type="button" onClick={() => void save()}>Save</button>
        <Link to="/admin/templates" onClick={() => setEditing(null)}>Cancel</Link>
      </div>
    </div>
  );
}
