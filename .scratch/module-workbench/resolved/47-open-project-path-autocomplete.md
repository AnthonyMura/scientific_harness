# 47 — Open project: unified path modal with folder autocomplete

Status: resolved
Module: app-shell (Open… flow), backend (fs listing)

## Request (user, 2026-10)

"When I want to open the project, if the app works in Windows it opens a
Windows [folder dialog], when from Linux it pops up a window where I can write
the path to the project. I love the approach of Linux but I need to add
autocomplete of paths — I want to see the next folder and the next folder etc.
Moreover I need to open only folders, so their names should have 100% opacity
while all other files should be visible but with lower opacity. I want to have
the same way of opening files in every system."

## Current behavior

- Electron shell (`workbench/app`): `Open…` calls the native OS folder dialog
  via `dialog:openFolder` IPC (`window.workbench.openFolderDialog`).
- Browser dev mode: `Open…` shows an inline modal with a bare absolute-path
  input, no suggestions.
So the open flow differs per platform, and the path input has no autocomplete.

## Design

One flow on every platform — the Linux-style modal, everywhere:

1. **Unified entry point.** `openFolder()` always opens the modal; the native
   dialog branch is removed (IPC handler, preload method, type declaration).
   The sidecar runs where the projects live, so a typed path is the right
   abstraction on Windows and Linux alike (WSL-mounted paths included — the
   same `_maybe_map` normalization that `open_project` uses applies to
   listings, so `/wsl.localhost/...` and `C:/...` forms autocomplete too).

2. **Backend: `GET /api/fs/list?path=<dir>`** (new, in `files.py`).
   Lists one directory level for an arbitrary absolute path on the machine the
   sidecar runs on — the same local-only + token trust model as the existing
   project endpoints. Empty path = home directory. Returns
   `{ path, entries: [{ name, is_dir }] }`, directories first then
   case-insensitive name (same order as the explorer tree), dotfiles hidden,
   capped at 500 entries with a `truncated` flag so a `node_modules` cannot
   blow up the dropdown. 404 when the path is not an existing directory —
   the modal then shows no suggestions but still allows submitting.

3. **Frontend: `OpenProjectModal`** (new component; replaces the inline modal
   in `App.tsx`).
   - As the path is typed (120 ms debounce), the last complete directory part
     is listed and a dropdown appears under the input with its entries whose
     names start with the typed fragment (case-insensitive). No matches for
     the fragment → the full listing is shown instead, so a typo never
     dead-ends the browse. Empty input lists the home directory — opening the
     modal already shows something to pick from.
   - **Folders at 100% opacity, files dimmed** (`opacity: .5`): only folders
     can be opened as projects; files stay visible as context. Folder rows
     carry a folder icon, file rows a file icon; the matched prefix of the
     name is bolded.
   - Picking a folder (click or ↑/↓ + Enter) appends its name **plus `/`** to
     the input, which immediately lists that folder's contents — "next folder
     and next folder etc." Picking a file just fills the name; submitting it
     fails with the backend's clear `not a directory` error, shown inline in
     the modal (the global banner is not used for open errors anymore).
   - Enter with no highlighted row submits the typed path (unchanged behavior
     for fully-typed paths); Escape closes; results are cached per directory
     for the session so re-navigating back is instant.

## Verification plan

- Backend: curl `GET /api/fs/list` against home, a nested dir, `~`, a WSL/UNC
  form, a file (404), and a missing path (404); confirm dotfile hiding,
  dirs-first order and the 500-entry cap.
- Web: `tsc --noEmit` + production build clean.
- UI: headless Chrome CDP — open the modal, type a partial path, assert the
  dropdown rows (folder vs file opacity via computed style), arrow-key
  selection appends the folder with a trailing slash and re-lists, Enter on an
  exact folder path opens the project, a file path yields the inline error.

## Resolution (2026-10)

Shipped exactly as designed:

- `workbench/backend/workbench_backend/files.py`: new `fs_list(raw_path)` —
  one directory level for any absolute path on the sidecar's machine; empty
  path = home; dirs first then case-insensitive name (explorer order); dotfiles
  hidden; capped at `FS_LIST_MAX_ENTRIES` (500) with a `truncated` flag; 404
  when not an existing directory. Reuses `_projects._maybe_map`, so WSL/UNC and
  Windows-style paths list the same as they open. Route `GET /api/fs/list?path=`
  added in `app.py`.
- `workbench/web/src/api.ts` + `types.ts`: `fsList(path)` client method and
  `FsEntry` / `FsListResponse` types.
- `workbench/web/src/components/OpenProjectModal.tsx` (new): the unified modal.
  Debounced (120 ms) per-directory listing keyed on the last complete path part;
  fragment prefix-filter (case-insensitive) with full-listing fallback on zero
  matches; folders at full opacity, files dimmed to `opacity: .5`; folder rows
  append name + `/` and re-list; file selection fills the name and submitting it
  surfaces the backend's `not a directory` error inline in the modal (`.fill-warn`);
  ↑/↓ + Enter select, Enter with no highlight submits, Escape closes; per-directory
  session cache. `App.tsx` now always opens this modal — the native-dialog branch,
  `submitOpen`, and the `openPath` state are gone.
- Electron: `dialog:openFolder` IPC handler removed from `main.js`, the preload
  method and its type declaration dropped from `preload.js` / `global.d.ts`.

Verified: backend curl suite (home, nested dir, file→404, missing→404, WSL-mapped
path, 600-entry synthetic dir → 500 + truncated); `tsc --noEmit` + production build
clean; headless Chrome CDP 17/17 (modal open + autofocus, home listing on empty
input, folder/file computed opacity, drill-in re-listing, zero-match fallback,
prefix narrowing, ArrowDown+Enter append + re-list, real project open closes the
modal and shows the name in the top bar, file path → inline error with modal
staying open, Escape closes).
