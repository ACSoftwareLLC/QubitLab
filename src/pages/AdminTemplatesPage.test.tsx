import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminTemplatesPage } from './AdminTemplatesPage';
import type { TemplateDetail, TemplateSummary } from '../types/templates';

vi.mock('../api/templates', () => ({
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

const mockAuthState = { user: { isAdmin: true } as { isAdmin: boolean } | null };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
} from '../api/templates';

// vitest runs without globals, so RTL auto-cleanup is not registered.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rows: TemplateSummary[] = [
  { id: 't1', slug: 'bell-state', title: 'Bell State', description: 'd', category: 'entanglement', difficulty: 1, published: true },
  { id: 't2', slug: 'grover', title: 'Grover', description: 'g', category: 'algorithm', difficulty: 3, published: false },
];

describe('AdminTemplatesPage', () => {
  it('guards non-admins', () => {
    mockAuthState.user = { isAdmin: false };
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    // jest-dom is not installed: use toBeTruthy() per repo convention.
    expect(screen.getByText(/administrators only/i)).toBeTruthy();
  });

  it('lists templates including drafts', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    expect(await screen.findByText('Bell State')).toBeTruthy();
    const li = screen.getByText('Grover').closest('li');
    expect(li).toBeTruthy();
    // jest-dom is not installed: assert text content directly.
    expect(li!.textContent).toMatch(/draft/i);
  });

  it('validates pasted circuit JSON inline without submitting', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue([]);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /new template/i }));
    fireEvent.change(screen.getByLabelText(/circuit json/i), {
      target: { value: '{not json}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      // jest-dom is not installed: use toBeTruthy() per repo convention.
      expect(screen.getByText(/invalid circuit json/i)).toBeTruthy()
    );
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('omits sortOrder when updating so the stored sort_order is preserved', async () => {
    mockAuthState.user = { isAdmin: true };
    const detail: TemplateDetail = {
      id: 't2',
      slug: 'grover',
      title: 'Grover',
      description: 'g',
      category: 'algorithm',
      difficulty: 3,
      published: false,
      circuit: { numBits: 1, ops: [] },
      articleHtml: '<p></p>',
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    vi.mocked(getTemplate).mockResolvedValue(detail);
    vi.mocked(updateTemplate).mockResolvedValue(detail);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    const li = (await screen.findByText('Grover')).closest('li')!;
    fireEvent.click(within(li).getByRole('button', { name: /edit/i }));
    // Form view appears only after the detail fetch resolves.
    expect(await screen.findByText(/edit: grover/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateTemplate).mock.calls[0][1]).not.toHaveProperty('sortOrder');
  });

  it('deletes with confirmation', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    vi.mocked(deleteTemplate).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    const li = (await screen.findByText('Grover')).closest('li')!;
    fireEvent.click(within(li).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('t2'));
  });

  it('surfaces an error banner when publishing fails', async () => {
    mockAuthState.user = { isAdmin: true };
    vi.mocked(listTemplates).mockResolvedValue(rows);
    vi.mocked(updateTemplate).mockRejectedValue(new Error('Publish failed'));
    render(<MemoryRouter><AdminTemplatesPage /></MemoryRouter>);
    const li = (await screen.findByText('Bell State')).closest('li')!;
    fireEvent.click(within(li).getByRole('button', { name: /unpublish/i }));
    // The list-view loadError banner renders the failure message.
    expect(await screen.findByText(/publish failed/i)).toBeTruthy();
  });
});
