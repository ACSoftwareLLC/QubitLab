import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Toolbox } from './toolbox';
import { GATE_CONFIGS, GATE_CATEGORIES } from '../constants/gates';
import { MAX_BITS } from '../constants/canvas';
import type { CanvasGate } from '../types';

type ToolboxProps = Parameters<typeof Toolbox>[0];

const defaultProps = (): ToolboxProps => ({
  gateConfigs: GATE_CONFIGS,
  selectedGate: null,
  numBits: 4,
  selectedPlacedGate: null,
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  onNumBitsChange: vi.fn(),
  onGateAngleChange: vi.fn(),
});

const rxGate: CanvasGate = {
  id: 7,
  type: 'Rx',
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  color: GATE_CONFIGS.Rx.color,
  angle: Math.PI / 4,
};

// vitest runs without globals, so RTL auto-cleanup is not registered.
afterEach(cleanup);

describe('Toolbox', () => {
  it('renders every gate category and every gate', () => {
    render(<Toolbox {...defaultProps()} />);

    for (const { label } of GATE_CATEGORIES) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const config of Object.values(GATE_CONFIGS)) {
      expect(screen.getByTitle(config.description)).toBeTruthy();
    }
  });

  it('displays the full gate name in the toolbox', () => {
    render(<Toolbox {...defaultProps()} />);

    for (const config of Object.values(GATE_CONFIGS)) {
      expect(screen.getByText(config.fullName)).toBeTruthy();
    }
  });

  it('makes toolbox items draggable and reports drag start with the gate type', () => {
    const onDragStart = vi.fn();
    render(<Toolbox {...defaultProps()} onDragStart={onDragStart} />);

    const item = screen.getByTitle(GATE_CONFIGS.H.description);
    expect(item.getAttribute('draggable')).toBe('true');

    fireEvent.dragStart(item, {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });

    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragStart.mock.calls[0][1]).toBe('H');
  });

  it('collapses to a slim rail and expands back', () => {
    render(<Toolbox {...defaultProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse toolbox' }));
    expect(screen.queryByTitle(GATE_CONFIGS.H.description)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show toolbox' }));
    expect(screen.getByTitle(GATE_CONFIGS.H.description)).toBeTruthy();
  });

  it('shows the current bit count and clamps the slider to MAX_BITS', () => {
    render(<Toolbox {...defaultProps()} />);

    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.min).toBe('1');
    expect(slider.max).toBe(String(MAX_BITS));
    expect(slider.value).toBe('4');
  });

  it('emits numeric bit changes', () => {
    const props = defaultProps();
    render(<Toolbox {...props} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '9' } });

    expect(props.onNumBitsChange).toHaveBeenCalledWith(9);
  });

  it('hides the angle editor when no parameterized gate is selected', () => {
    const first = render(<Toolbox {...defaultProps()} />);
    expect(screen.queryByText('Rx angle')).toBeNull();
    first.unmount();

    const hGate: CanvasGate = { ...rxGate, type: 'H', angle: undefined };
    render(<Toolbox {...defaultProps()} selectedPlacedGate={hGate} />);
    expect(screen.queryByText('H angle')).toBeNull();
  });

  it('shows the angle editor for a selected parameterized gate', () => {
    render(<Toolbox {...defaultProps()} selectedPlacedGate={rxGate} />);
    expect(screen.getByText('Rx angle')).toBeTruthy();
  });

  it('applies quick angles to the selected gate', () => {
    const props = defaultProps();
    render(<Toolbox {...props} selectedPlacedGate={rxGate} />);

    fireEvent.click(screen.getByRole('button', { name: 'π/4' }));

    expect(props.onGateAngleChange).toHaveBeenCalledWith(rxGate.id, Math.PI / 4);
  });
});
