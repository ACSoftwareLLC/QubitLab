# Planned Features

Candidate features for QubitLab, roughly in priority order. Each gets its own
design pass (brainstorm → approve → build) before implementation starts.

---

## 1. Algorithm template gallery — *shipped*

**Status:** shipped (2026-08-27) — gallery + rich articles + admin curation in D1;
see `docs/superpowers/specs/2026-08-26-template-gallery-design.md`.

Curated, ready-to-load quantum circuits (Grover, teleportation, Deutsch–Jozsa,
QFT, Bell states…) shown as a browsable gallery. Clicking a template loads it
into the editor where the user can run it immediately.

### Decisions so far

- [x] v1 includes **rich articles**: each template carries a blog-style
      explanation (how it works, what to look for in the statevector), not
      just a card description.
- [x] **Admin-curated in D1**: same model as blogs — admins create/edit via
      an admin UI backed by a new D1 table; editable without redeploying.
- [x] **Own page + nav**: dedicated `/templates` route with its own entry in
      the AppLayout navigation.

### Open questions

- Guided/stepped lesson mode — likely a follow-up phase on top of articles

**Why:** biggest missing pillar for a learner-facing quantum tool; new users
currently land on an empty canvas.

**Size:** medium.

## 2. Remix + likes

"Remix" copies any community circuit into your editor with attribution
("remixed from @user"), plus likes/stars and popularity sorting on the
community page. Turns the marketplace from a museum into a behavioral loop.

**Size:** medium.

## 3. Editor power tools

Undo/redo history (currently absent from `useCanvasState`), keyboard
shortcuts, possibly multi-select. Table-stakes editor UX felt by every user.

**Size:** small–medium.

## 4. Export / import

OpenQASM/Qiskit export first (small), PNG/SVG diagram image export, circuit
import last. Plugs QubitLab into the wider quantum ecosystem.

**Size:** small (export) → medium (import).

## 5. Smaller ideas

- **Secret-link sharing** for private circuits (unlisted URL) — tiny.
- **Bloch-sphere playback animation** across simulation segments — builds on
  recent Bloch sphere work; small–medium.

## Parked

- **Noise / density-matrix simulation** (mixed states, depolarizing channels)
  — architectural change to the Rust simulator core; revisit when there's a
  strong pull.
