# 18 — PDF pane: Save version + Save As (compiled output as project files)

Status: resolved

## Scope

The PDF viewer is the development process's output sink; compiled PDFs should
be savable into the project as meaningful versions (v3: "save as, save
version"). The independent generic viewer will live in the container library
later — this pane stays document-compile-specific. Git-style snapshots are out
of scope for v0.

## Implementation

- Backend (`workbench_backend/files.py` + `app.py`):
  - `POST /api/artifacts/save-version` — copies `.workbench/build/<artifact>`
    into `<project>/versions/`, auto-named `{stem}-{YYYYmmdd-HHMMSS}.pdf` (or a
    user-supplied name, flattened, `.pdf` appended if missing); 409 on
    collision.
  - `POST /api/files/copy` — safe copy of any project file to another project
    path; 404/409 as appropriate.
- `web/src/components/PdfViewer.tsx` — header gains **Save version** (compiled
  mode only: one click, timestamped copy into `versions/`, success shown as a
  fading chip) and **Save As…** (both modes: modal with a path input; compiled
  mode copies the build artifact, static mode copies the opened file; existing
  files are never overwritten — the backend rejects). Both bump `ctx.treeTick`
  so the Explorer shows the new folder/file immediately.
- `web/src/components/FileExplorer.tsx` — reloads its tree when `treeTick`
  changes (external writes), and refreshes the .tex list after create/rename/
  delete.

## Verification

`tsc --noEmit` clean; vite build OK. Backend live checks: save-version created
`versions/main-20260915-005630.pdf`; copy works and returns 409 on an existing
target. Headless E2E: after a compile, Save version shows the chip
"saved versions/main-20260915-011406.pdf", the file exists on disk in
`test-latex-project/versions/`, and the Explorer tree gains a `versions` row.
