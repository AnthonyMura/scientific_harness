# 16 — LaTeX compile controls move to the editor pane

Status: resolved

## Scope

The Compile button, the "what to compile" picker and Cancel lived in the PDF
pane header. More logical placement: the editor pane header, shown only when
the active file is a `.tex` file — when working with a tex file you want to
click Compile right there. The PDF pane becomes the output sink (preview,
SyncTeX, save actions), not the control surface.

## Implementation

- `web/src/components/EditorPane.tsx` — when the tab's file ends in `.tex`,
  the header gains a compile cluster: a "what to compile" select of all project
  .tex files (defaulting to the project's main file, kept valid as the list
  changes) plus Compile / Cancel (while any job runs). Compiles go through the
  new `ctx.onCompileFile(file)`; auto-compile on save still builds
  `project.main_file`.
- `web/src/App.tsx` — `compile(auto, file?)` accepts an explicit file; new
  state: `texFiles` (fetched per project via `GET /api/files/tex`, refreshed by
  the Explorer after create/rename/delete), `artifactNames` (the artifact names
  reported by the last successful compile) and `treeTick` (bumped when project
  files change externally so the Explorer reloads). New ctx fields: `texFiles`,
  `refreshTexFiles`, `onCompileFile`, `pdfArtifact`, `treeTick`, `bumpTree`.
- `web/src/components/PdfViewer.tsx` — compile controls removed from the header
  (auto-compile checkbox, target select, install warning, SSH form, Compile /
  Cancel). Kept: status chip, "Compile failed - Run Log" shortcut, zoom, gear.
  The pane now fetches by `ctx.pdfArtifact` names instead of hardcoded
  `main.pdf` / `main.synctex.gz`, so a main file that is not `main.tex` works.

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E (test project): editor header
shows the picker with `appendix.tex` + `main.tex` while `main.tex` is open;
clicking Compile runs a real compile and renders 5 PDF pages in the pane that
opens right of the editor; the PDF header contains no Compile button and no
target picker.
