# 22 — Opening a project shows only the Explorer

Status: resolved

## Scope

Opening a project (picking from the Recent list, Open…, or New…) used to
open the Explorer **and** an editor tab with the project's main file
(main.tex). Requested behavior: the project opens with the Explorer only —
files land in the editor when picked from the tree.

## Implementation

- `web/src/App.tsx` — `openDefaultTabs()` no longer takes a project and no
  longer dispatches an editor tab; it opens (or focuses) the Explorer only.
  Covers every entry point that boots a project layout: boot with a current
  project, picking from the Recent list, Open…, New…; the persisted-tab
  restore path is untouched (a saved session still reopens its tabs).
- `web/src/modules/ctx.ts` + `App.tsx` — new `anyEditorOpen` flag (true while
  any editor tab exists): with no default editor tab, the Explorer's
  single-click-open condition (`editorFocused`) was never true on a fresh
  project open.
- `web/src/components/FileExplorer.tsx` — `rowClick`: a single click opens a
  file when the editor is focused **or** when no editor tab is open at all
  (nothing to steal focus from); with editors open and another pane focused,
  a single click still only selects.
- `web/src/components/Workbench.tsx` — the empty-pane hint is context-aware:
  with a project open it reads "Click a file in the Explorer to open it — or
  drag a module here."

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E against 127.0.0.1:5199
(fresh Chrome profile, driven over CDP): boot with the current project —
persisted layout holds only the explorer tab and the root matches; picking
the same project from the Recent list — resetTabs + openDefaultTabs leave
only the explorer tab and the empty center pane shows the Explorer hint;
single-clicking main.tex in the tree opens `editor:main.tex` (11/11 checks).
