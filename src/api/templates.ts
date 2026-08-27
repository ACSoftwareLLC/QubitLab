import type {
  TemplateSummary,
  TemplateDetail,
  TemplateInput,
} from '../types/templates';

type TemplateCreateInput = Required<
  Pick<
    TemplateInput,
    'slug' | 'title' | 'description' | 'category' | 'difficulty' | 'circuit' | 'articleHtml'
  >
> &
  TemplateInput;

const apiFetch = async (
  method: string,
  path: string,
  body?: Record<string, unknown>
) => {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as
    | { error?: string; templates?: TemplateSummary[]; template?: TemplateDetail }
    | Record<string, never>;
  return { ok: res.ok, status: res.status, data };
};

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { ok, data } = await apiFetch('GET', '/auth/templates');
  if (!ok || !data.templates) throw new Error(data.error || 'Failed to load templates');
  return data.templates;
}

export async function getTemplate(slug: string): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch(
    'GET',
    `/auth/templates/${encodeURIComponent(slug)}`
  );
  if (status === 404) throw new Error(data.error || 'Template not found');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to load template');
  return data.template;
}

export async function createTemplate(input: TemplateCreateInput): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch('POST', '/auth/templates', input);
  if (status === 409) throw new Error(data.error || 'That slug is already in use');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to create template');
  return data.template;
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<TemplateDetail> {
  const { ok, status, data } = await apiFetch(
    'PATCH',
    `/auth/templates/${encodeURIComponent(id)}`,
    input
  );
  if (status === 409) throw new Error(data.error || 'That slug is already in use');
  if (!ok || !data.template) throw new Error(data.error || 'Failed to update template');
  return data.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/auth/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to delete template');
  }
}
