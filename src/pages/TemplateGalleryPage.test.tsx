import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TemplateGalleryPage } from './TemplateGalleryPage';
import type { TemplateSummary } from '../types/templates';

vi.mock('../api/templates', () => ({
  listTemplates: vi.fn(),
}));

import { listTemplates } from '../api/templates';

// vitest runs without globals, so RTL auto-cleanup is not registered.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const summaries: TemplateSummary[] = [
  { id: 't1', slug: 'bell-state', title: 'Bell State', description: 'Entanglement.', category: 'entanglement', difficulty: 1, published: true },
  { id: 't2', slug: 'grover-search', title: 'Grover Search', description: 'Unstructured search.', category: 'algorithm', difficulty: 3, published: true },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TemplateGalleryPage />
    </MemoryRouter>
  );
}

describe('TemplateGalleryPage', () => {
  it('renders cards with category and difficulty labels', async () => {
    vi.mocked(listTemplates).mockResolvedValue(summaries);
    renderPage();
    expect(await screen.findByText('Bell State')).toBeTruthy();
    expect(screen.getByText('Grover Search')).toBeTruthy();
    expect(screen.getByText(/beginner/i)).toBeTruthy();
    expect(screen.getByText(/advanced/i)).toBeTruthy();
  });

  it('filters by category when a chip is clicked', async () => {
    vi.mocked(listTemplates).mockResolvedValue(summaries);
    renderPage();
    await screen.findByText('Bell State');
    fireEvent.click(screen.getByRole('button', { name: /^entanglement$/i }));
    expect(screen.queryByText('Grover Search')).toBeNull();
    expect(screen.getByText('Bell State')).toBeTruthy();
  });

  it('shows an empty state when no templates exist', async () => {
    vi.mocked(listTemplates).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no templates yet/i)).toBeTruthy();
  });
});
