"""File tree/read/write/create/rename/delete inside the current project.

Writes are in-place (open-write-close), never temp-plus-rename: atomic rename
is unsupported on some shares (plan section 3, risk 1). Rename uses os.rename
and falls back to copy+remove when the share refuses a direct rename.
"""

from __future__ import annotations

import mimetypes
import os
import shutil
from pathlib import Path

from .errors import ApiError

EDITABLE_SUFFIXES = {".tex", ".md"}

#: Safety cap for raw image serving (tree thumbnails, M3).
RAW_IMAGE_MAX_BYTES = 5 * 1024 * 1024


def safe_path(root: Path, rel: str | None) -> Path:
    """Resolve `rel` inside `root`; refuse anything that escapes it."""
    root_resolved = root.resolve()
    if not rel:
        return root_resolved
    p = (root_resolved / rel).resolve()
    try:
        p.relative_to(root_resolved)
    except ValueError:
        raise ApiError(400, f"path escapes project root: {rel}") from None
    return p


def tree(root: Path, rel_dir: str | None, show_hidden: bool = False) -> dict:
    d = safe_path(root, rel_dir)
    if not d.is_dir():
        raise ApiError(404, f"not a directory: {rel_dir or '.'}")
    root_resolved = root.resolve()
    entries = []
    for child in sorted(d.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if not show_hidden and child.name.startswith("."):
            continue  # hide dotfiles (.git, .workbench, ...) from the explorer
        try:
            st = child.stat()
        except OSError:
            continue
        is_dir = child.is_dir()
        entries.append(
            {
                "name": child.name,
                "path": str((d / child.name).relative_to(root_resolved)).replace("\\", "/"),
                "is_dir": is_dir,
                "size": st.st_size if not is_dir else None,
                "mtime": st.st_mtime,
            }
        )
    return {"dir": rel_dir or "", "entries": entries}


def read_file(root: Path, rel: str) -> dict:
    p = safe_path(root, rel)
    if not p.is_file():
        raise ApiError(404, f"not a file: {rel}")
    try:
        content = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise ApiError(415, "binary file; only .tex/.md text files are editable") from None
    return {"path": rel, "content": content}


def raw_image(root: Path, rel: str) -> tuple[bytes, str]:
    """Raw bytes + media type of an image file (tree thumbnails, M3)."""
    p = safe_path(root, rel)
    if not p.is_file():
        raise ApiError(404, f"not a file: {rel}")
    media_type = mimetypes.guess_type(p.name)[0]
    if not media_type or not media_type.startswith("image/"):
        raise ApiError(415, "not an image file") from None
    size = p.stat().st_size
    if size > RAW_IMAGE_MAX_BYTES:
        raise ApiError(413, f"file too large for preview ({size} bytes)") from None
    return p.read_bytes(), media_type


def write_file(root: Path, rel: str, content: str) -> dict:
    p = safe_path(root, rel)
    if p.exists() and p.is_dir():
        raise ApiError(400, f"is a directory: {rel}")
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    return {"path": rel, "bytes": len(content.encode("utf-8"))}


def create_path(root: Path, rel: str, kind: str) -> dict:
    if kind not in ("file", "dir"):
        raise ApiError(400, 'kind must be "file" or "dir"')
    p = safe_path(root, rel)
    if p.exists():
        raise ApiError(409, f"already exists: {rel}")
    if kind == "dir":
        p.mkdir(parents=True)
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8"):
            pass
    return {"path": rel}


def rename_path(root: Path, old_rel: str, new_rel: str) -> dict:
    src = safe_path(root, old_rel)
    dst = safe_path(root, new_rel)
    if not src.exists():
        raise ApiError(404, f"not found: {old_rel}")
    if dst.exists():
        raise ApiError(409, f"already exists: {new_rel}")
    try:
        os.rename(src, dst)
    except OSError:
        # Share refused a direct rename (EXDEV or 9p limitation): copy, then
        # remove the source. A failure mid-copy surfaces as a plain error.
        if src.is_dir():
            shutil.copytree(src, dst)
            shutil.rmtree(src)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            src.unlink()
    return {"from": old_rel, "to": new_rel}


def delete_path(root: Path, rel: str) -> dict:
    if not rel:
        raise ApiError(400, "refusing to delete the project root")
    p = safe_path(root, rel)
    if p == root.resolve():
        raise ApiError(400, "refusing to delete the project root")
    if not p.exists():
        raise ApiError(404, f"not found: {rel}")
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"path": rel}
