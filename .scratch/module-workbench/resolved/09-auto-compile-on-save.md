# 09 — Auto-compile on save (M3)

Status: resolved

## Scope
The M3 plan lists "auto-compile on save (toggleable)" as a remaining item. When
enabled for a project, saving any `.tex` file in the editor starts a compile of
the project's main file automatically; rapid saves while a compile is running are
coalesced into a single follow-up run instead of queuing one compile per save.

## Implementation
- `backend/workbench_backend/projects.py` — the project payload returned by
  `POST /api/projects/open` and `GET /api/project/current` now carries
  `auto_compile: bool(cfg.get("auto_compile", False))`. Persistence needed no
  change: `PUT /api/config` already accepted and stored the `auto_compile` key in
  `<root>/.workbench/project.json`, and `GET /api/config` returns it.
- `web/src/types.ts` — `Project.auto_compile: boolean`.
- `web/src/modules/ctx.ts` — AppCtx gains `onFileSaved(path)`: the editor's
  save-success notification channel.
- `EditorPane.tsx` — after a successful `writeFile`, the pane calls
  `savedRef.current(filePath)` (a ref to `ctx.onFileSaved`, so no re-render
  dependency on the app callback).
- `App.tsx`:
  - `compile(auto?)` now guards with `compilingRef` (set synchronously at start,
    cleared when the polled job leaves "running"; reset on a failed start so a
    retry is possible) and labels auto runs "auto-compiling <name> after save".
  - `onFileSaved(path)`: acts only for `.tex` files with `project.auto_compile`
    on. If a compile is running (or in the async start gap), it sets
    `autoPendingRef` instead of starting; when the polled job finishes, the app
    consumes the flag and starts exactly one follow-up run. Saves while disabled,
    or for non-`.tex` files, do nothing.
  - `setAutoCompile(on)` — `PUT /api/config {project: {auto_compile}}` + local
    project-state update; failures surface as a banner.
- `ProjectBar.tsx` + `styles.css` — an "Auto-compile" checkbox in the top bar
  (only when a project is open), Vesper-styled, with a tooltip explaining the
  behavior.

## Verification
- Build: `tsc --noEmit` clean; `vite build` OK (pre-existing chunk-size warning
  only).
- Live CDP end-to-end in the real app at 127.0.0.1:5199 against the scrolltest
  project (13-page PDF, ~1 s TinyTeX compile), with `window.fetch` instrumented
  to count `/api/files/write` and `/api/compile/start` calls and a 100 ms-sampled
  timeline of start counts + top-bar state recorded in-page:
  - toggle initially off; enabling it flips the checkbox **and** the persisted
    backend config (`GET /api/config` → `auto_compile: true`).
  - edit + Ctrl+S: exactly one write per save, exactly one compile start; Cancel
    appears in the top bar; no error banner.
  - a second save ~0.25 s later lands while that compile is still running: the
    recorded timeline shows no new start for the whole remainder of the first run
    (coalesced), then exactly one follow-up fires at completion (`starts` goes
    1 → 2 and stays there); run log chip "finished"; PDF artifact mtime advanced
    on disk.
  - disabling the toggle flips the config back to false; a further save produces
    no compile start and no banner.
- Test-harness notes (both were harness bugs, not app bugs):
  - sending both `rawKeyDown` and `keyDown` per modifier combo delivers two DOM
    keydown events to CodeMirror, so each Ctrl+S ran `save()` twice; the app
    still held its invariant under that barrage (one compile in flight, at most
    one queued follow-up), but the harness now sends `keyDown`/`keyUp` only.
  - coalescing is asserted from the recorded timeline (no start between the
    second save and the first run's completion tick) rather than wall-clock
    sleeps, because these compiles take ~1 s and a fixed sleep races them.

## Accepted v0 limitations
- Any `.tex` save triggers a compile of the project's main file (Overleaf-style);
  there is no per-file or content-diff gating, and no debounce timer — coalescing
  bounds the cost to one extra run for bursts of saves.
- A save that fails (e.g. permission error) does not trigger a compile; the
  editor's error message shows instead.
- The toggle is per-project and lives in the top bar; there is no settings-menu
  entry yet.
