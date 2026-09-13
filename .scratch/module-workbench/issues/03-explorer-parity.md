# 03 — File explorer parity

Status: resolved

## Scope
VSCode/PyCharm-style explorer: type-colored icons, create/rename/delete with
inline editing, context menus, refresh/collapse-all, active-file highlight.

## Implementation
- `web/src/icons.tsx` — stroke icon set (24 viewBox) + `entryIcon(name, isDir,
  expanded)` returning color-classed icons: ic-folder (sand), ic-tex
  (gold-bright), ic-md (taupe), ic-pdf (err), ic-img (brown), ic-file.
- `web/src/components/FileExplorer.tsx` — full rewrite:
  - hover row actions (new file / new folder on dirs; rename / delete on files)
  - right-click context menu on rows and empty tree space
  - inline create input + inline rename input (Enter commits, Esc cancels,
    blur commits), double-click renames, F2 renames the selection
  - delete confirmation modal; deletes report prefixes to the app so open
    editor tabs close; renames retab editor tabs
  - header: new file / new folder / refresh / collapse-all + settings gear
  - "Show hidden files" toggle re-lists cached directories
- `web/src/components/ContextMenu.tsx` — portal menu, viewport clamping,
  closes on outside click / Esc / resize.

## Verification
Backend endpoints covered by ticket 01; UI compiles clean (tsc + vite) and is
served through the dev server.
