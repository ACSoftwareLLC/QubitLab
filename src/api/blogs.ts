import type { BlogPost } from '../types/blog.ts';

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
    | { error?: string; posts?: BlogPost[]; post?: BlogPost; success?: boolean }
    | Record<string, never>;
  return { ok: res.ok, status: res.status, data };
};

export async function listBlogs(): Promise<BlogPost[]> {
  const { ok, data } = await apiFetch('GET', '/auth/blogs');
  if (!ok || !data.posts) {
    throw new Error(data.error || 'Failed to load blog posts');
  }
  return data.posts;
}

export async function getBlog(slug: string): Promise<BlogPost> {
  const { ok, status, data } = await apiFetch('GET', `/auth/blogs/${encodeURIComponent(slug)}`);
  if (status === 404) {
    throw new Error('Post not found');
  }
  if (!ok || !data.post) {
    throw new Error(data.error || 'Failed to load blog post');
  }
  return data.post;
}

export async function createBlog(
  post: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>
): Promise<BlogPost> {
  const { ok, status, data } = await apiFetch('POST', '/auth/blogs', post as Record<string, unknown>);
  if (status === 401) {
    throw new Error('You must be signed in');
  }
  if (status === 403) {
    throw new Error('Only admins can create blog posts');
  }
  if (status === 409) {
    throw new Error('A post with that slug already exists');
  }
  if (!ok || !data.post) {
    throw new Error(data.error || 'Failed to create blog post');
  }
  return data.post;
}

export async function updateBlog(
  slug: string,
  post: Partial<Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>>
): Promise<BlogPost> {
  const { ok, status, data } = await apiFetch(
    'PATCH',
    `/auth/blogs/${encodeURIComponent(slug)}`,
    post as Record<string, unknown>
  );
  if (status === 401) {
    throw new Error('You must be signed in');
  }
  if (status === 403) {
    throw new Error('Only admins can update blog posts');
  }
  if (status === 404) {
    throw new Error('Post not found');
  }
  if (!ok || !data.post) {
    throw new Error(data.error || 'Failed to update blog post');
  }
  return data.post;
}

export async function deleteBlog(slug: string): Promise<void> {
  const { ok, status, data } = await apiFetch('DELETE', `/auth/blogs/${encodeURIComponent(slug)}`);
  if (status === 401) {
    throw new Error('You must be signed in');
  }
  if (status === 403) {
    throw new Error('Only admins can delete blog posts');
  }
  if (status === 404) {
    throw new Error('Post not found');
  }
  if (!ok || !data.success) {
    throw new Error(data.error || 'Failed to delete blog post');
  }
}
