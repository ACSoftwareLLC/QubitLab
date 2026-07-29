import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFitScale } from './useFitScale';
import { WORKSPACE_WIDTH, WORKSPACE_HEIGHT } from '../constants/canvas';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const makeEl = (width: number, height: number): HTMLDivElement => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  return el;
};

describe('useFitScale', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at scale 1 with no element attached and does not observe anything', () => {
    const { result } = renderHook(() => useFitScale());
    expect(result.current.fitScale).toBe(1);
    expect(MockResizeObserver.instances).toHaveLength(0);
  });

  it('attaches an observer when the element mounts after the first render', () => {
    // The builder mounts the canvas region only after the auth loading
    // screen, so the hook must observe late-arriving elements.
    const { result } = renderHook(() => useFitScale());
    const el = makeEl(WORKSPACE_WIDTH, WORKSPACE_HEIGHT);

    act(() => result.current.ref(el));

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0].observe).toHaveBeenCalledWith(el);
    expect(result.current.fitScale).toBe(1);
  });

  it('computes the letterboxed fit when width is the limiting dimension', () => {
    const { result } = renderHook(() => useFitScale());
    act(() => result.current.ref(makeEl(WORKSPACE_WIDTH / 2, WORKSPACE_HEIGHT * 2)));
    expect(result.current.fitScale).toBeCloseTo(0.5);
  });

  it('computes the letterboxed fit when height is the limiting dimension', () => {
    const { result } = renderHook(() => useFitScale());
    act(() => result.current.ref(makeEl(WORKSPACE_WIDTH * 4, WORKSPACE_HEIGHT / 4)));
    expect(result.current.fitScale).toBeCloseTo(0.25);
  });

  it('upscales on screens larger than the workspace', () => {
    const { result } = renderHook(() => useFitScale());
    act(() => result.current.ref(makeEl(WORKSPACE_WIDTH * 2, WORKSPACE_HEIGHT * 2)));
    expect(result.current.fitScale).toBe(2);
  });

  it('recomputes when the container resizes', () => {
    const { result } = renderHook(() => useFitScale());
    const el = makeEl(WORKSPACE_WIDTH, WORKSPACE_HEIGHT);
    act(() => result.current.ref(el));
    expect(result.current.fitScale).toBe(1);

    Object.defineProperty(el, 'clientWidth', { value: WORKSPACE_WIDTH / 2, configurable: true });
    act(() => MockResizeObserver.instances[0].trigger());

    expect(result.current.fitScale).toBeCloseTo(0.5);
  });

  it('ignores zero-sized measurements', () => {
    const { result } = renderHook(() => useFitScale());
    act(() => result.current.ref(makeEl(0, 0)));
    expect(result.current.fitScale).toBe(1);
  });

  it('disconnects the observer on unmount', () => {
    const { result, unmount } = renderHook(() => useFitScale());
    act(() => result.current.ref(makeEl(100, 100)));

    unmount();

    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalled();
  });
});
