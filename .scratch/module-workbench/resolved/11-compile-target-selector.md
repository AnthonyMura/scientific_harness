# 11 — Compile target selector UI + per-target install hints (M3)

Status: resolved

## Scope
The backend already supports a per-project compile target (`auto` / `local` /
`wsl`, persisted in the project config and consumed by `compile_service.start`),
and the Install panel already probes every target and shows what is missing.
What was missing was the UI to actually choose: there was no way to see which
target a project compiles with, change it, or get an install hint before hitting
Compile and failing. This ticket adds the top-bar selector and the per-target
availability/hint display. No backend changes were needed.

## Implementation
- `web/src/modules/targets-ui.ts` (new) — pure helpers mapping the
  `/api/install/status` probe results to top-bar state, no React/fetch so they
  are unit-testable in-page via Vite's ESM import:
  - `localTexSummary` — what the `local` target would use (in-app TinyTeX first,
    then system TeX), with a one-line status text.
  - `hasWslTarget` — the backend only offers `wsl` on Windows hosts; the option
    is rendered only when the probe lists it.
  - `targetTooltip` — per-target tooltip: resolved version when ready, missing
    detail + install hint otherwise.
  - `needsInstall(target, targets)` — whether the selected target lacks a usable
    TeX (`auto` warns only when no target has any). Returns false while probing
    so the UI never nags prematurely.
  - `installHint` — the one-line hint shown on the warning chip.
- `ProjectBar.tsx` — new "Target" control next to Auto-compile: a select with
  Auto / Local (host TeX) / WSL (when offered), plus a red "TeX missing —
  install" chip that appears when `needsInstall` is true; the chip's tooltip is
  the target's install hint and clicking it opens the existing Install TeX
  module. A stale persisted value that the backend no longer offers renders as a
  disabled "unavailable" option instead of an empty select.
- `App.tsx` — fetches `api.installStatus()` on project open and re-fetches after
  every install job settles (tick bumped in the job-polling completion branch);
  new `setTarget` persists via `PUT /api/config {project:{target}}` and updates
  local state, same pattern as auto-compile. The existing `compile()` already
  passes `project.target` to `startCompile`, so the selector value drives
  compilation with no further wiring.
- `styles.css` — `.target-pick` (matches the `.auto-compile` label styling) and
  `.target-warn` (error-tinted chip).

## Verification
- Build: `tsc --noEmit` clean; `vite build` OK (pre-existing chunk-size warning
  only).
- Live CDP end-to-end in the real app at 127.0.0.1:5199 (headless Chrome,
  trusted mouse events), scrolltest project open — 16/16 checks:
  - selector renders with value `auto`; options are exactly `[auto, local]`
    (no `wsl` on this Linux-hosted backend).
  - after the probe completes, the tooltip reads "resolves to local" and names
    the in-app TinyTeX.
  - pure-helper unit tests run in-page via `import("/src/modules/targets-ui.ts")`:
    13 branches covering needsInstall (auto/local/wsl × none/local-only/wsl-only),
    hasWslTarget, localTexSummary, installHint and the wsl tooltip fallback — all pass.
  - selecting `local` updates the select, persists to the backend config
    (`GET /api/project/current` → `target: "local"`), and survives a page reload.
  - Compile with the explicit `local` target succeeds (job done, PDF artifact);
    switching back to `auto` persists too and auto-compiles successfully —
    proving the selector value drives compilation end-to-end.
  - Warning chip path tested against reality: `workbench/.texlive` moved aside,
    page reloaded → chip appears with the TinyTeX-1 install hint in its tooltip;
    clicking it opens the Install TeX module; `.texlive` restored and reloaded →
    chip disappears again.
  - no page exceptions during the run (favicon 404 aside).

## Accepted v0 limitations
- The probe runs on project open and after install jobs finish; a system TeX
  installed outside the app while it is running is not noticed until then.
- `auto` resolution is mirrored in the UI as "any target has TeX" — close enough
  to the backend's local-then-wsl order for v0 (the only divergence: a Windows
  host with both would resolve to local, which is also what the tooltip shows).
- The wsl option cannot be exercised on this Linux-hosted dev machine; its
  branches are covered by the in-page unit tests instead.
