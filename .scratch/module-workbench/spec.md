# Module workbench — spec

Make the workbench UI behave like VSCode/PyCharm: a real file explorer with
file manipulation, and a module system where every module is a draggable tab
that can live in any area (sidebar / center / right / bottom panel), plus a
settings gear on every module.

Status: sections 1 and 3 implemented (issues 01–04). Section 2 superseded by
the recursive split-tree layout (issue 05): splittable panes instead of fixed
areas — any tab can live in any pane, created by dragging to a pane edge.

## 1. File explorer (VSCode parity for v0)

- File-type icons (tex, md, pdf, images, generic) and open/closed folder icons.
- Create new file and new folder (header buttons + hover actions + context menu),
  inline name entry in the target directory.
- Rename via double-click inline edit and context menu.
- Delete via context menu with a confirmation dialog; deleting a directory
  removes it recursively; open editor tabs for removed/renamed files are closed
  (rename re-opens the file under its new name).
- Refresh and collapse-all actions.
- Settings gear: tree font size, show hidden (dot) files.

Backend endpoints added to the sidecar:

| Endpoint | Purpose |
|---|---|
| POST /api/files/create `{path, kind: "file"|"dir"}` | Create empty file or directory (parents created) |
| POST /api/files/rename `{from, to}` | Rename/move within project root |
| POST /api/files/delete `{path}` | Delete file or directory tree (root refused) |
| GET /api/files/tree?dir=...&hidden=1 | Optional dotfile listing |

## 2. Module system

- Module registry: each module has an id, title, icon, default area, singleton
  flag, a render function and a settings schema.
- Areas: `sidebar` (left), `center`, `right` (auxiliary), `panel` (bottom).
  Dividers are draggable; double-click collapses the adjacent area.
- Activity bar (left edge): one icon per module; click opens/focuses the
  module's tab in its default area.
- Tabs: each open module instance is a tab with a close button and a dot menu:
  Close, Move to Sidebar/Center/Right/Panel, Fullscreen toggle.
- Drag & drop: tabs can be dragged onto another tab (insert at position) or an
  empty area (append). Layout persists in localStorage.
- Fullscreen: one area temporarily fills the whole workbench; Esc exits.
- Ctrl/Cmd+W closes the active center tab.

## 3. Per-module settings

Every module header carries a gear button opening a settings popover with that
module's controls (persisted to localStorage, applied live):

| Module | Settings |
|---|---|
| Explorer | tree font size (10-20 px), show hidden files |
| Editor | font size (10-28 px), line height (1.3-2.2), tab size (2/4/8), word wrap |
| PDF preview | zoom (50-300 %) |
| Run log | log font size (10-20 px) |
| Install TeX | placeholder note (no settings yet) |

## 4. Modules in scope

- `explorer` (singleton, default sidebar)
- `editor` (multi-instance, one tab per file, default center)
- `pdf` (singleton "PDF Preview", default right — the LaTeX compilation output;
  can be dragged anywhere or fullscreened)
- `log` (singleton "Run Log", default bottom panel)
- `install` (singleton "Install TeX", default right)

Out of scope: split editor groups, tab search, file watcher live refresh,
multi-root projects, trash/recycle bin.
