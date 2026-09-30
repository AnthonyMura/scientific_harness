# 56 — Git module: folder changes need icons + default .gitignore on repo init

Status: ready-for-agent
Machine: lab

## Request (user)

"target: git module — changes for folders are shown as no icon now, They need
icons. And we need .gitignore for this git version control."

## Current state

- `renderFileRow` in `workbench/web/src/components/GitPane.tsx` renders each
  Staged/Changes row as badge + `baseName(path)` + `parentDir(path)` — no entry
  icon at all. For an untracked directory, porcelain v2 reports one type-2
  entry with a trailing slash (`?? versions/`), so `baseName("versions/")` is
  the empty string and `parentDir("versions/")` is `"versions"`: the row shows
  only an "A" badge plus the folder name in the muted dir slot — no icon, no
  visible primary name. That is the "no icon" complaint.
- Repository init never creates a `.gitignore`: `gitsvc.init_only` (Git module
  empty state, `POST /api/git/init` with `commit=false`) and
  `gitsvc.init_and_commit` (scaffold flow, `workbench/backend/workbench_backend/projects.py:167`)
  only run `git init`. Only the manuscript template ships one
  (`workbench/backend/templates/manuscript/.gitignore`); a plain project
  initialized from the Git module therefore lists LaTeX aux files and app
  folders (`.workbench/`, `versions/`) as changes — including whole folders.

## Requirements

1. Directory entries in the Staged/Changes lists render with a folder icon;
   file entries get the Explorer's type icon (`entryIcon` from
   `workbench/web/src/icons.tsx`) so rows are scannable like the tree. Fix the
   name/dir split for trailing-slash paths (folder name is the primary name,
   its parent goes to the muted dir slot).
2. Directory rows keep Stage/Unstage/Discard (all already handle directories:
   `git add -A -- <dir>/`, `git rm -r --cached`, `shutil.rmtree`), but drop
   "Open diff" and "Open in editor" — a folder has no single-file diff or
   editor target.
3. Repo init through the Git module writes a default `.gitignore` at the
   project root when none exists — plain init (`init_only`) and scaffold init
   (`init_and_commit`): app state (`.workbench/`), milestone PDFs
   (`versions/*.pdf`), LaTeX build artifacts. Never overwrite an existing
   `.gitignore`.

## Implementation notes

- Backend: one helper in `workbench/backend/workbench_backend/git.py` called
  from both init paths, before `add -A`, so the baseline commit includes it.
- Web: extract the pure display logic (is-dir detection + name/dir split) as
  exported helpers in GitPane.tsx and cover them with vitest (node env, no
  DOM); row rendering picks `FolderIcon`/`entryIcon` from that helper.
- Tests: backend pytest for init .gitignore behavior (created / not
  overwritten / committed in baseline) and the trailing-slash status entry
  shape; web vitest for the display helpers.

## Related

- #42 — Git module (resolved): owns the Changes view + porcelain-v2 parsing
- #18 — PDF save version (`versions/` folder), #06 — in-app TeX artifacts
- `workbench/web/src/components/GitPane.tsx`, `workbench/backend/workbench_backend/git.py`

## Comments

New ticket (2026-09-30); user request quoted above. Numbered 56 at creation:
a concurrent session claimed 55 for the image viewer module
(`feat/55-image-viewer-module`).
