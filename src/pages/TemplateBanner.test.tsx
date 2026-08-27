import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TemplateBanner } from './TemplateBanner';

afterEach(cleanup);

describe('TemplateBanner', () => {
  it('shows the template title', () => {
    render(<TemplateBanner name="Bell State" onDismiss={() => {}} />);
    // jest-dom is not installed: use toBeTruthy() per repo convention.
    expect(screen.getByText(/loaded template/i)).toBeTruthy();
    expect(screen.getByText('Bell State')).toBeTruthy();
  });

  it('calls onDismiss when dismissed', () => {
    let dismissed = false;
    render(<TemplateBanner name="X" onDismiss={() => { dismissed = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss template banner/i }));
    expect(dismissed).toBe(true);
  });
});
