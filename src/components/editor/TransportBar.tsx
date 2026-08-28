import { useEffect, useRef, useState } from "react";
import type { SimStatus } from "../../hooks/useSimulation";

/** Full-width simulation transport bar: run controls, status, scrubber. */

interface TransportBarProps {
        status: SimStatus;
        numSteps: number;
        currentSegment: number;
        /** Columns that contain ops (scrubber ticks light up for these). */
        activeColumns: number[];
        onRun: () => void;
        onStart: () => void;
        onStep: () => void;
        onReset: () => void;
        /** Jump to a column's snapshot (scrub). */
        onScrub: (segment: number) => void;
        onScrubEnd: () => void;
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
        /** Live mode: statevector recomputes automatically on edits. */
        isLive: boolean;
        onToggleLive: () => void;
        /** Copies a shareable URL for the current circuit to the clipboard. */
        onShare: () => void;
}

export function TransportBar({
        status,
        numSteps,
        currentSegment,
        activeColumns,
        onRun,
        onStart,
        onStep,
        onReset,
        onScrub,
        onScrubEnd,
        canUndo,
        canRedo,
        onUndo,
        onRedo,
        isLive,
        onToggleLive,
        onShare,
}: TransportBarProps) {
        // Transient "Copied!" feedback after a share click.
        const [copied, setCopied] = useState(false);
        const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
        useEffect(
                () => () => {
                        if (copiedTimer.current) clearTimeout(copiedTimer.current);
                },
                [],
        );
        const handleShare = () => {
                onShare();
                setCopied(true);
                if (copiedTimer.current) clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 1500);
        };

        const executing =
                status === "ready" || status === "running" || status === "done";
        const canInteract = status === "ready" || status === "running";

        // Live mode replaces the manual transport: Start/Step/Run would
        // fight the automatic recompute, so they stay disabled while on.
        const transportDisabled = isLive;

        return (
                <div className="ev2-transport">
                        <div className="ev2-transport-controls">
                                {!executing ? (
                                        <button
                                                className="ev2-btn ev2-btn-primary"
                                                onClick={onStart}
                                                disabled={transportDisabled}
                                                title="Start simulation"
                                                aria-label="Start simulation"
                                        >
                                                <i className="bi bi-play-fill" />
                                        </button>
                                ) : (
                                        <>
                                                <button
                                                        className="ev2-btn"
                                                        onClick={onStep}
                                                        disabled={
                                                                !canInteract ||
                                                                transportDisabled
                                                        }
                                                        title="Step one column"
                                                        aria-label="Step one column"
                                                >
                                                        <i className="bi bi-skip-end-fill" />
                                                </button>
                                                <button
                                                        className="ev2-btn ev2-btn-primary"
                                                        onClick={onRun}
                                                        disabled={
                                                                !canInteract ||
                                                                transportDisabled
                                                        }
                                                        title="Run to completion"
                                                        aria-label="Run to completion"
                                                >
                                                        <i className="bi bi-fast-forward-fill" />
                                                </button>
                                                <button
                                                        className="ev2-btn"
                                                        onClick={onReset}
                                                        disabled={transportDisabled}
                                                        title="Reset simulation"
                                                        aria-label="Reset simulation"
                                                >
                                                        <i className="bi bi-arrow-counterclockwise" />
                                                </button>
                                        </>
                                )}
                        </div>

                        <div className="ev2-transport-progress">
                                <span
                                        className={`ev2-status-pill ev2-status-${status}`}
                                >
                                        {status}
                                </span>
                                <span className="ev2-segment-readout">
                                        {executing
                                                ? `col ${Math.max(0, currentSegment)} / ${Math.max(0, numSteps - 1)}`
                                                : "—"}
                                </span>
                                <div
                                        className="ev2-scrubber"
                                        onPointerLeave={onScrubEnd}
                                >
                                        {Array.from({ length: 10 }, (_, i) => {
                                                const active =
                                                        activeColumns.includes(
                                                                i,
                                                        );
                                                const current =
                                                        executing &&
                                                        currentSegment === i;
                                                return (
                                                        <button
                                                                key={i}
                                                                type="button"
                                                                className={`ev2-scrub-tick${active ? " active" : ""}${current ? " current" : ""}`}
                                                                onPointerEnter={() =>
                                                                        executing &&
                                                                        active &&
                                                                        onScrub(
                                                                                i,
                                                                        )
                                                                }
                                                                disabled={
                                                                        !executing ||
                                                                        !active
                                                                }
                                                                aria-label={`Scrub to column ${i + 1}`}
                                                        />
                                                );
                                        })}
                                </div>
                        </div>

                        <div className="ev2-transport-edit">
                                <button
                                        className="ev2-btn"
                                        onClick={handleShare}
                                        title="Copy shareable link"
                                        aria-label="Copy shareable link"
                                >
                                        <i
                                                className={`bi ${copied ? "bi-clipboard-check" : "bi-share"}`}
                                        />
                                </button>
                                <button
                                        className={`ev2-btn${isLive ? " ev2-btn-live" : ""}`}
                                        onClick={onToggleLive}
                                        aria-pressed={isLive}
                                        title="Live simulation — recompute as you edit"
                                        aria-label="Live simulation"
                                >
                                        <i className="bi bi-lightning-charge-fill" />
                                </button>
                                <button
                                        className="ev2-btn"
                                        onClick={onUndo}
                                        disabled={!canUndo}
                                        title="Undo (Ctrl+Z)"
                                        aria-label="Undo"
                                >
                                        <i className="bi bi-arrow-counterclockwise" />
                                </button>
                                <button
                                        className="ev2-btn"
                                        onClick={onRedo}
                                        disabled={!canRedo}
                                        title="Redo (Ctrl+Shift+Z)"
                                        aria-label="Redo"
                                >
                                        <i className="bi bi-arrow-clockwise" />
                                </button>
                        </div>
                </div>
        );
}
