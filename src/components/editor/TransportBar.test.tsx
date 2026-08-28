import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { TransportBar } from "./TransportBar";
import type { SimStatus } from "../../hooks/useSimulation";

const defaultProps = () => ({
  status: "idle" as SimStatus,
  numSteps: 0,
  currentSegment: -1,
  activeColumns: [0, 2],
  onRun: vi.fn(),
  onStart: vi.fn(),
  onStep: vi.fn(),
  onReset: vi.fn(),
  onScrub: vi.fn(),
  onScrubEnd: vi.fn(),
  canUndo: true,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  isLive: false,
  onToggleLive: vi.fn(),
});

afterEach(cleanup);

const liveButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(
    'button[aria-label="Live simulation"]',
  );

describe("TransportBar live toggle", () => {
  it("renders the live toggle unpressed by default", () => {
    const { container } = render(<TransportBar {...defaultProps()} />);
    const btn = liveButton(container);
    expect(btn).toBeTruthy();
    expect(btn!.getAttribute("aria-pressed")).toBe("false");
    expect(btn!.className).not.toContain("ev2-btn-live");
  });

  it("shows the pressed style and aria-pressed when live is on", () => {
    const props = defaultProps();
    props.isLive = true;
    const { container } = render(<TransportBar {...props} />);
    const btn = liveButton(container);
    expect(btn!.getAttribute("aria-pressed")).toBe("true");
    expect(btn!.className).toContain("ev2-btn-live");
  });

  it("fires onToggleLive on click", () => {
    const props = defaultProps();
    const { container } = render(<TransportBar {...props} />);
    fireEvent.click(liveButton(container)!);
    expect(props.onToggleLive).toHaveBeenCalledTimes(1);
  });

  it("disables Start while live is on", () => {
    const props = defaultProps();
    props.isLive = true;
    const { container } = render(<TransportBar {...props} />);
    const start = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Start simulation"]',
    );
    expect(start).toBeTruthy();
    expect(start!.disabled).toBe(true);
  });

  it("disables Step and Run while live is on, even mid-session", () => {
    const props = defaultProps();
    props.isLive = true;
    props.status = "running";
    const { container } = render(<TransportBar {...props} />);
    const step = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Step one column"]',
    );
    const run = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Run to completion"]',
    );
    const reset = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reset simulation"]',
    );
    expect(step!.disabled).toBe(true);
    expect(run!.disabled).toBe(true);
    expect(reset!.disabled).toBe(true);
  });

  it("keeps Start enabled when live is off", () => {
    const { container } = render(<TransportBar {...defaultProps()} />);
    const start = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Start simulation"]',
    );
    expect(start!.disabled).toBe(false);
  });
});
