# 17 — Project settings: main file chosen from the file list (Overleaf-style)

Status: resolved

## Scope

Project-level LaTeX settings had no home once the compile controls left the PDF
pane, and the main file was only ever set by convention. Overleaf logic: a
project settings menu where the main document is **chosen from the project's
.tex files** (not typed by name), alongside the compile target and auto-compile.

## Implementation

- `web/src/components/ProjectSettingsMenu.tsx` (new) — portal popover with
  three rows: Main file (select of `ctx.texFiles`, persisted via
  `PUT /api/config {project: {main_file}}`), Compile target (the selector moved
  here from the PDF pane, including the install warning and the SSH form, now
  inline), Auto-compile toggle. Closes on outside click / Escape; clamps to the
  viewport like SettingsMenu.
- `web/src/components/ProjectBar.tsx` — gear button next to the project name
  opens the menu; the bar now receives `ctx`.
- `web/src/App.tsx` — `setMainFile` persists the choice, updates local project
  state and resets `artifactNames` so the PDF pane follows the new main file's
  output.
- Backend: `GET /api/files/tex` (recursive .tex list, hidden dirs skipped) in
  `workbench_backend/app.py` + `files.tex_files`.

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E: the gear opens the menu with
labels Main file / Compile target / Auto-compile; the main-file select lists
`appendix.tex` + `main.tex` and holds the current value (`main.tex`); Escape
closes it. Backend: `/api/files/tex` returns `["appendix.tex","main.tex"]`.
