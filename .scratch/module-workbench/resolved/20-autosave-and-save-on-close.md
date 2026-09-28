# 20 — Autosave and save-on-close for editor tabs

Status: resolved

## Scope

Edits only persisted on Ctrl+S, the Save button, or a compile — closing a tab,
switching projects, or closing the window silently discarded unsaved work. The
editor should behave like a modern IDE: save shortly after typing stops, and
never lose pending edits when a tab or the window goes away.

## Implementation

- `web/src/components/EditorPane.tsx` — debounced autosave (1 s after the last
  keystroke) with the same semantics as a manual save (the dirty dot clears only
  if the doc has not moved on mid-write; auto-compile-on-save still fires for
  .tex). Writes serialize through a per-view promise chain so an unmount flush
  can never race an in-flight write. The view effect's cleanup cancels the
  pending timer and flushes dirty content before destroying the view, so closing
  a tab or switching away persists edits. Each tab registers an
  `EditorSaveHandle` (`dirty`, `run`, `flush`) with the app instead of a bare
  save function.
- `web/src/App.tsx` — page-teardown guard: both `beforeunload` and `pagehide`
  flush every dirty handle (which event fires varies by browser and navigation
  type; a first flush claims the write so the second is a no-op).
- `web/src/api.ts` — new `flushFile`: fire-and-forget `fetch` with
  `keepalive: true`. Chrome aborts synchronous XHR mid-teardown (verified in
  headless CDP); keepalive is the only request type that finishes after unload
  begins. Bodies are capped at 64 KB by the platform, so a larger doc loses at
  most the sub-second of typing since the last autosave.
- `web/src/modules/ctx.ts` — `EditorSaveHandle` interface (`dirty`, `run`,
  `flush`).

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E (test project, CDP, a .bib
probe file so autosave never triggered a compile): typed MARKER_A — nothing on
disk immediately, present after ~1 s idle (the debounce works both ways); typed
MARKER_B — still absent 300 ms later, closed the tab with Ctrl+W, marker on
disk within 500 ms (unmount flush); reopened, typed MARKER_C and navigated the
window away immediately — marker on disk (keepalive unload flush). All six
checks passed. Along the way this surfaced two browser facts that shaped the
design: in headless Chrome `beforeunload` fires inconsistently while sync XHR is
aborted during teardown, so the guard listens to both events and writes via
keepalive fetch.
