import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StatePanel } from './StatePanel';
import type { Snapshot } from '../api/types';

// vitest runs without globals, so RTL auto-cleanup is not registered.
afterEach(cleanup);

type StatePanelProps = Parameters<typeof StatePanel>[0];

const defaultProps = (): StatePanelProps => ({
  status: 'idle',
  snapshot: null,
  peekSnapshot: null,
  errors: [],
  unconnectedGateIds: [],
  numBits: 1,
});

const snapshot: Snapshot = {
  segment: 2,
  statevector: [
    { basis: '00', re: 0.707, im: 0, prob: 0.5 },
    { basis: '11', re: -0.707, im: 0.001, prob: 0.5 },
  ],
  measurements: { '3': 1 },
};

describe('StatePanel', () => {
  it('prompts to start when idle', () => {
    const { container } = render(<StatePanel {...defaultProps()} />);
    expect(container.textContent).toContain('Press Start to execute the circuit');
  });

  it('warns when the simulation engine fails to load', () => {
    const { container } = render(<StatePanel {...defaultProps()} status="offline" />);
    expect(container.textContent).toContain('Simulation engine failed to load');
  });

  it('lists validation errors for invalid circuits', () => {
    const { container } = render(
      <StatePanel
        {...defaultProps()}
        status="invalid"
        errors={[
          { opId: 1, message: 'overlapping targets' },
          { opId: null, message: 'no bits configured' },
        ]}
      />,
    );
    expect(container.textContent).toContain('Invalid circuit');
    expect(container.textContent).toContain('overlapping targets');
    expect(container.textContent).toContain('no bits configured');
  });

  it('warns about unconnected gates', () => {
    const { container } = render(<StatePanel {...defaultProps()} unconnectedGateIds={[1, 2]} />);
    expect(container.textContent).toContain('2 gate(s) not connected to a bit line');
  });

  it('renders statevector entries with formatted amplitudes and probabilities', () => {
    const { container } = render(
      <StatePanel {...defaultProps()} status="running" snapshot={snapshot} />,
    );
    expect(container.textContent).toContain('|00⟩');
    expect(container.textContent).toContain('|11⟩');
    expect(container.textContent).toContain('0.707 + 0.000i');
    expect(container.textContent).toContain('-0.707 + 0.001i');
    expect(container.textContent.match(/50\.0%/g)).toHaveLength(2);
  });

  it('renders measurement outcomes', () => {
    const { container } = render(
      <StatePanel {...defaultProps()} status="done" snapshot={snapshot} />,
    );
    expect(container.textContent).toContain('Measurements');
    expect(container.textContent).toContain('gate 3:');
    expect(container.textContent).toContain('1');
  });

  it('shows the peek badge when hovering a segment', () => {
    const { container } = render(
      <StatePanel
        {...defaultProps()}
        status="running"
        snapshot={snapshot}
        peekSnapshot={{ ...snapshot, segment: 5 }}
      />,
    );
    expect(container.textContent).toMatch(/peek\s*@\s*5/);
  });

  it('explains the empty statevector', () => {
    const { container } = render(
      <StatePanel
        {...defaultProps()}
        status="running"
        snapshot={{ segment: 0, statevector: [], measurements: {} }}
      />,
    );
    expect(container.textContent).toContain('no amplitudes above ε');
  });

  it('collapses to a slim rail and expands back', () => {
    render(<StatePanel {...defaultProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse state panel' }));
    expect(screen.queryByText('State')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show state panel' }));
    expect(screen.getByText('State')).toBeTruthy();
  });

  it('renders the Bloch sphere toggle when qubits are present', () => {
    render(<StatePanel {...defaultProps()} numBits={2} />);
    const btn = screen.getByRole('button', { name: 'Show Bloch Sphere' }) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('disables the Bloch sphere toggle when no qubits are configured', () => {
    render(<StatePanel {...defaultProps()} numBits={0} />);
    const btn = screen.getByRole('button', { name: 'Show Bloch Sphere' }) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });
});
