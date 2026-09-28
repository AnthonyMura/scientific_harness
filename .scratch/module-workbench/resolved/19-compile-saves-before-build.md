# 19 — Compile saves open edits before building

Status: resolved

## Scope

Clicking Compile with unsaved editor changes compiled the stale on-disk
content — the user's edits appeared to be reset (the PDF showed the old text).
The Compile button should save and compile: persist whatever is open in the
editor first, then build.

## Implementation

- `web/src/components/EditorPane.tsx` — `save` is now async and returns a
  success flag (`Promise<boolean>`); a `dirtyRef` mirrors the dirty state for
  stable closures. Each tab registers its save with the app via
  `ctx.registerEditorSave(filePath, save)` (unregistered on unmount or file
  change); the registered save writes only when the tab is actually dirty and
  never fires auto-compile. The Compile button gains a tooltip: "Saves open
  edits, then compiles".
- `web/src/App.tsx` — keeps a registry of open editor saves (`editorSavesRef`).
  `compile()` claims its run before any await, persists all registered dirty
  editor tabs via `Promise.all`, and starts the backend job only if every save
  succeeded; on save failure it releases the guard and shows a banner instead
  of compiling stale content. Because pre-compile saves never notify
  `onFileSaved`, auto-compile-on-save cannot double-trigger a compile.
- `web/src/modules/ctx.ts` — new ctx field `registerEditorSave`.

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E (test project, CDP): typed a
marker into main.tex without saving (dirty dot lit), clicked Compile — exactly
one `/api/compile/start` fired even with auto-compile ON (no double compile),
the marker was on disk before latexmk ran and the successful build's input
contained it, the job finished `done` / exit 0 with a 5-page PDF, and the dirty
dot cleared. A second run with the marker placed in the abstract body compiled
cleanly end-to-end; the test project was restored afterwards.
