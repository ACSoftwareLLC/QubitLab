import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type * as React from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCanvasState } from './useCanvasState';
import type { GateType } from '../types';
import {
  GATE_WIDTH,
  SNAPPED_ABS_Y,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';
import { GATE_CONFIGS } from '../constants/gates';

const SEGMENT0_CENTER = SEGMENTS_START_X + SEGMENT_WIDTH / 2;

/** Minimal stand-in for a React drag event carrying a gate type. */
const makeDropEvent = (clientX: number, gateType: GateType | '' = 'H') =>
  ({
    preventDefault: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      setData: vi.fn(),
      getData: (key: string) => (key === 'gateType' ? gateType : ''),
    },
    clientX,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      contains: () => false,
    },
    relatedTarget: null,
  }) as unknown as React.DragEvent;

/** Minimal stand-in for a Konva drag-end event at an absolute position. */
const makeKonvaDragEndEvent = (x: number, y: number) => {
  let pos = { x, y };
  return {
    event: {
      currentTarget: {
        position: (newPos?: { x: number; y: number }) => {
          if (newPos) pos = newPos;
          return pos;
        },
      },
    } as unknown as KonvaEventObject<DragEvent>,
    getPos: () => pos,
  };
};

const dropGate = (
  result: { current: ReturnType<typeof useCanvasState> },
  clientX: number,
  gateType: GateType = 'H',
) => {
  act(() => result.current.handleDrop(makeDropEvent(clientX, gateType)));
  return result.current.gates[result.current.gates.length - 1];
};

describe('useCanvasState', () => {
  beforeEach(() => {
    let id = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => id++);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with an empty canvas and sensible defaults', () => {
    const { result } = renderHook(() => useCanvasState());
    expect(result.current.gates).toEqual([]);
    expect(result.current.gateLines).toEqual([]);
    expect(result.current.numBits).toBe(4);
    expect(result.current.stageScale).toBe(1);
    expect(result.current.selectedGate).toBeNull();
    expect(result.current.selectedPlacedGateId).toBeNull();
    expect(result.current.dragPreview).toBeNull();
    expect(result.current.draggingGateLine).toBeNull();
  });

  describe('handleDrop', () => {
    it('places a gate snapped to the segment under the pointer', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, 'X');

      expect(gate.type).toBe('X');
      expect(gate.x).toBe(SEGMENT0_CENTER - GATE_WIDTH / 2);
      expect(gate.y).toBe(SNAPPED_ABS_Y);
      expect(gate.color).toBe(GATE_CONFIGS.X.color);
    });

    it('applies the default angle for parameterized gates only', () => {
      const { result } = renderHook(() => useCanvasState());
      const rx = dropGate(result, SEGMENT0_CENTER, 'Rx');
      const h = dropGate(result, SEGMENT0_CENTER, 'H');

      expect(rx.angle).toBe(GATE_CONFIGS.Rx.defaultAngle);
      expect(h.angle).toBeUndefined();
    });

    it('falls back to H for unknown gate types', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, '' as GateType);
      expect(gate.type).toBe('H');
    });
  });

  describe('handleGateDragEnd', () => {
    it('snaps the gate to the nearest segment center', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      const oneSegmentRight = SEGMENT0_CENTER + SEGMENT_WIDTH - GATE_WIDTH / 2;
      const { event, getPos } = makeKonvaDragEndEvent(oneSegmentRight, 123);
      act(() => result.current.handleGateDragEnd(gate.id, event));

      const expectedX = SEGMENT0_CENTER + SEGMENT_WIDTH - GATE_WIDTH / 2;
      expect(result.current.gates[0]).toMatchObject({ x: expectedX, y: SNAPPED_ABS_Y });
      // Konva node is snapped imperatively too
      expect(getPos()).toEqual({ x: expectedX, y: SNAPPED_ABS_Y });
    });

    it('deletes the gate when dropped left of the segment area', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      const { event } = makeKonvaDragEndEvent(-500, 0);
      act(() => result.current.handleGateDragEnd(gate.id, event));

      expect(result.current.gates).toEqual([]);
    });
  });

  describe('gate lines', () => {
    const connectLine = (
      result: { current: ReturnType<typeof useCanvasState> },
      gateId: number,
      originIndex: number,
      endY: number,
    ) => {
      act(() => result.current.handleGateLineStart(gateId, originIndex, 20, 400, endY));
      act(() => result.current.handleStageMouseUp());
    };

    it('creates a target line when released on a bit line', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      const barY = FIRST_BIT_LINE_Y + BIT_LINE_SPACING;

      connectLine(result, gate.id, 0, barY);

      expect(result.current.gateLines).toHaveLength(1);
      expect(result.current.gateLines[0]).toMatchObject({
        gateId: gate.id,
        barY,
        role: 'target',
        originIndex: 0,
      });
      expect(result.current.draggingGateLine).toBeNull();
    });

    it('assigns the control role to origins beyond the target capacity', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, 'CX'); // 1 target + 1 control

      connectLine(result, gate.id, 1, FIRST_BIT_LINE_Y);

      expect(result.current.gateLines[0].role).toBe('control');
    });

    it('snaps the endpoint to the closest bit line within tolerance', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y + 10);

      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y);
    });

    it('does not create a line when released far from any bit line', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y - 100);

      expect(result.current.gateLines).toEqual([]);
    });

    it('moves the existing line when the same origin is reconnected', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING);

      expect(result.current.gateLines).toHaveLength(1);
      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING);
    });

    it('toggleGateLineRole flips target to control and back', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      const lineId = result.current.gateLines[0].id;

      act(() => result.current.toggleGateLineRole(lineId));
      expect(result.current.gateLines[0].role).toBe('control');
      act(() => result.current.toggleGateLineRole(lineId));
      expect(result.current.gateLines[0].role).toBe('target');
    });

    it('updateGateLineBarY moves a line to another bit', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      const lineId = result.current.gateLines[0].id;

      act(() => result.current.updateGateLineBarY(lineId, FIRST_BIT_LINE_Y + BIT_LINE_SPACING));
      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y + BIT_LINE_SPACING);
    });
  });

  describe('handleDeleteGate', () => {
    it('removes the gate along with its lines and selection', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      act(() => result.current.handleGateLineStart(gate.id, 0, 20, 400, FIRST_BIT_LINE_Y));
      act(() => result.current.handleStageMouseUp());
      act(() => result.current.handleSelectGate(gate.id));

      act(() => result.current.handleDeleteGate(gate.id));

      expect(result.current.gates).toEqual([]);
      expect(result.current.gateLines).toEqual([]);
      expect(result.current.selectedPlacedGateId).toBeNull();
    });
  });

  describe('handleSelectGate', () => {
    it('selects a gate and deselects it on a second click', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      act(() => result.current.handleSelectGate(gate.id));
      expect(result.current.selectedPlacedGateId).toBe(gate.id);
      act(() => result.current.handleSelectGate(gate.id));
      expect(result.current.selectedPlacedGateId).toBeNull();
    });
  });

  describe('handleGateAngleChange', () => {
    it('updates only the matching gate', () => {
      const { result } = renderHook(() => useCanvasState());
      const rx = dropGate(result, SEGMENT0_CENTER, 'Rx');
      const other = dropGate(result, SEGMENT0_CENTER, 'H');

      act(() => result.current.handleGateAngleChange(rx.id, 1.23));

      expect(result.current.gates.find(g => g.id === rx.id)?.angle).toBe(1.23);
      expect(result.current.gates.find(g => g.id === other.id)?.angle).toBeUndefined();
    });
  });

  describe('zoom', () => {
    it('zooms in and out in 0.1 steps and resets to 1', () => {
      const { result } = renderHook(() => useCanvasState());

      act(() => result.current.zoomIn());
      expect(result.current.stageScale).toBeCloseTo(1.1);
      act(() => result.current.zoomOut());
      expect(result.current.stageScale).toBeCloseTo(1);
      act(() => result.current.zoomIn());
      act(() => result.current.resetZoom());
      expect(result.current.stageScale).toBe(1);
    });

    it('clamps the scale between 0.3 and 3', () => {
      const { result } = renderHook(() => useCanvasState());

      for (let i = 0; i < 30; i++) act(() => result.current.zoomIn());
      expect(result.current.stageScale).toBe(3);
      for (let i = 0; i < 40; i++) act(() => result.current.zoomOut());
      expect(result.current.stageScale).toBe(0.3);
    });
  });

  describe('setNumBits', () => {
    it('updates the number of bits', () => {
      const { result } = renderHook(() => useCanvasState());
      act(() => result.current.setNumBits(7));
      expect(result.current.numBits).toBe(7);
    });
  });
});
