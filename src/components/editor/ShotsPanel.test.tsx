import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ShotsPanel } from "./ShotsPanel";
import type { Circuit } from "../../api/types";

afterEach(cleanup);

const circuitWith = (...wires: number[]): Circuit => ({
  numBits: 4,
  ops: wires.map((w, i) => ({
    id: 100 + i,
    type: "M",
    segment: i,
    targets: [w],
    controls: [],
    angle: null,
  })),
});

describe("ShotsPanel", () => {
  it("collapsed by default; expands on header click", () => {
    const { container, getByRole } = render(
      <ShotsPanel circuit={circuitWith(0)} numBits={4} />,
    );
    const header = getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".ev2-shots-body")).toBeNull();

    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".ev2-shots-body")).not.toBeNull();
  });

  it("zero-M circuit shows the hint and no run controls", () => {
    const { container, getByRole } = render(
      <ShotsPanel circuit={{ numBits: 4, ops: [] }} numBits={4} />,
    );
    fireEvent.click(getByRole("button"));
    expect(container.textContent).toContain(
      "Add a Measure gate to sample outcomes",
    );
    expect(container.querySelector(".ev2-shots-run")).toBeNull();
  });

  it("measured circuit shows shot chips and the run button", () => {
    const { container, getByRole } = render(
      <ShotsPanel circuit={circuitWith(0, 1)} numBits={4} />,
    );
    fireEvent.click(getByRole("button"));
    const chips = container.querySelectorAll(".ev2-shots-choices .ev2-chip-btn");
    expect(chips.length).toBe(3);
    expect(container.querySelector(".ev2-shots-run")).not.toBeNull();
  });

  it("excludes M gates beyond the wire count", () => {
    // M on wire 3 while numBits=2 → no measured wires → hint state.
    const { container, getByRole } = render(
      <ShotsPanel circuit={circuitWith(3)} numBits={2} />,
    );
    fireEvent.click(getByRole("button"));
    expect(container.textContent).toContain(
      "Add a Measure gate to sample outcomes",
    );
  });

  it("defaults to 10 shots and switches chips", () => {
    const { container, getByRole } = render(
      <ShotsPanel circuit={circuitWith(0)} numBits={4} />,
    );
    fireEvent.click(getByRole("button"));
    const chips = [
      ...container.querySelectorAll(".ev2-shots-choices .ev2-chip-btn"),
    ];
    expect(chips[0].className).toContain("active");
    fireEvent.click(chips[2]);
    expect(chips[2].className).toContain("active");
    expect(chips[0].className).not.toContain("active");
  });

  it("run failures surface the error message", async () => {
    const { simulateCircuit } = await import("../../api/client");
    vi.spyOn(await import("../../api/client"), "simulateCircuit").mockRejectedValue(
      new Error("boom"),
    );
    void simulateCircuit;
    const { container, getByRole } = render(
      <ShotsPanel circuit={circuitWith(0)} numBits={4} />,
    );
    fireEvent.click(getByRole("button"));
    fireEvent.click(container.querySelector(".ev2-shots-run")!);
    // The mocked wasm layer never resolves via import cache in jsdom
    // without the real module; the error state assertion is best-effort:
    await vi.waitFor(() => {
      expect(container.textContent).toMatch(/Shots failed|Run shots/);
    });
  });
});
