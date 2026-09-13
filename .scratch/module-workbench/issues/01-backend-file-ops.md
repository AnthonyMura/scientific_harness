# 01 — Backend file operations (create / rename / delete / hidden tree)

Status: resolved

## Scope
VSCode-parity file manipulation behind the existing sidecar auth middleware.

## Implementation
- `backend/workbench_backend/files.py`
  - `create_path(root, rel, kind)` — creates a file or directory; 409 if it exists.
  - `rename_path(root, old_rel, new_rel)` — `os.rename` with copy+remove fallback across devices; 404/409 guards.
  - `delete_path(root, rel)` — `rmtree`/`unlink`; refuses the project root (400).
  - `tree()` gained `show_hidden: bool = False` (hidden files like `.workbench/`).
- `backend/workbench_backend/app.py` routes:
  - `POST /api/files/create {path, kind}`
  - `POST /api/files/rename {from, to}`
  - `POST /api/files/delete {path}`
  - `GET /api/files/tree?dir=&hidden=1`

## Verification
All endpoints tested against the live sidecar (port 8765): create dir/file, rename,
rename onto existing → 409, delete file/dir, delete root → 400, path escape
(`../evil`) → 400, `hidden=1` reveals dotfiles. Sidecar auto-reloads (`--reload`).
