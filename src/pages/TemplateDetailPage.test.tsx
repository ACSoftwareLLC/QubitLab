import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TemplateDetailPage } from './TemplateDetailPage';
import { TEMPLATE_PREFETCH_KEY } from './templatePrefetch';
import type { TemplateDetail } from '../types/templates';

vi.mock('../api/templates', () => ({
  getTemplate: vi.fn(),
}));

import { getTemplate } from '../api/templates';

// vitest runs without globals, so RTL auto-cleanup is not registered.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const bell: TemplateDetail = {
  id: 't1',
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Entanglement demo.',
  category: 'entanglement',
  difficulty: 1,
  published: true,
  circuit: {
    numBits: 2,
    ops: [
      { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
      { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
    ],
  },
  articleHtml:
    '<p>Watch the statevector become entangled<script>alert(1)</script></p>',
  createdAt: '2026-08-26T00:00:00Z',
  updatedAt: '2026-08-26T00:00:00Z',
};

function renderAt(path = '/templates/bell-state') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:slug" element={<TemplateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TemplateDetailPage', () => {
  it('renders sanitized article html', async () => {
    vi.mocked(getTemplate).mockResolvedValue(bell);
    renderAt();
    // jest-dom is not installed: use toBeTruthy() per repo convention.
    expect(await screen.findByText(/entangled/i)).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });

  it('open-in-editor stores the circuit under the prefetch key', async () => {
    vi.mocked(getTemplate).mockResolvedValue(bell);
    renderAt();
    // @testing-library/user-event is not a dependency: use fireEvent.
    const button = await screen.findByRole('button', { name: /open in editor/i });
    fireEvent.click(button);

    const stored = JSON.parse(sessionStorage.getItem(TEMPLATE_PREFETCH_KEY)!);
    expect(stored.title).toBe('Bell State');
    expect(stored.circuit.numBits).toBe(2);
  });

  it('shows the error message on failed loads', async () => {
    vi.mocked(getTemplate).mockRejectedValue(new Error('Template not found'));
    renderAt('/templates/nope');
    // jest-dom is not installed: use toBeTruthy() per repo convention.
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});
