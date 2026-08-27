import { describe, it, expect, afterEach, vi } from 'vitest';
import { listTemplates, getTemplate } from './templates';

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = {
  id: 'tpl-1',
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Entanglement demo.',
  category: 'entanglement',
  difficulty: 1,
  published: true,
};

describe('templates api client', () => {
  it('lists templates with credentials included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ templates: [summary] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('bell-state');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/templates',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('surfaces a friendly error for 404 detail fetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Template not found' }),
      })
    );
    await expect(getTemplate('nope')).rejects.toThrow('Template not found');
  });
});
