"""Project open/create/recent. A project is a folder; its identity is its path."""

from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path

from . import state
from .errors import ApiError

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def _slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "-", name.strip()).strip("-.")
    return s or "project"


def _maybe_map(raw_path: str) -> Path:
    """Translate paths across the Windows/WSL boundary.

    The GUI folder dialog (Windows) can hand back UNC paths into a WSL distro
    while the backend runs inside that same distro, and drive-letter paths may
    arrive at a Linux backend. Normalize both directions so `open` works from
    either side of the boundary.
    """
    s = raw_path.replace("\\", "/")
    if sys.platform != "win32":
        m = re.match(r"^/wsl\.(?:localhost|bash)/[^/]+/(.*)$", s)
        if m:
            return Path("/" + m.group(1))
        m = re.match(r"^/([A-Za-z])/(.*)$", s)
        if m:
            return Path(f"/mnt/{m.group(1).lower()}/" + m.group(2))
        return Path(raw_path).expanduser()
    m = re.match(r"^/([A-Za-z])/(.*)$", s)
    if m and not raw_path.startswith("/"):
        return Path(f"{m.group(1)}:/" + m.group(2))
    return Path(raw_path).expanduser()


def default_new_project_dir() -> Path:
    home = Path.home()
    if sys.platform == "win32":
        base = Path(os.environ.get("USERPROFILE", str(home))) / "Documents"
    else:
        base = home / "Documents"
    return base / "Workbench"


def open_project(st, raw_path: str) -> dict:
    root = _maybe_map(raw_path)
    if not root.exists():
        raise ApiError(404, f"not a directory: {root}")
    root = root.resolve()
    if not root.is_dir():
        raise ApiError(400, f"not a directory: {root}")
    cfg = state.load_project_config(root)
    proj = {
        "id": str(root),
        "name": root.name,
        "root": str(root),
        "main_file": cfg.get("main_file") or "main.tex",
        "target": cfg.get("target") or "auto",
        "auto_compile": bool(cfg.get("auto_compile", False)),
        "ssh": cfg.get("ssh") or None,
    }
    st.set("current_project", proj["id"])
    recents = [r for r in st.get("recent_projects", []) if r.get("id") != proj["id"]]
    recents.insert(0, proj)
    st.set("recent_projects", recents[:20])
    return proj


def new_project(st, name: str, location: str | None = None) -> dict:
    slug = _slug(name)
    if not slug:
        raise ApiError(400, "project name is empty")
    base = Path(location).expanduser() if location else default_new_project_dir()
    base.mkdir(parents=True, exist_ok=True)
    root = base / slug
    n = 2
    while root.exists():
        root = base / f"{slug}-{n}"
        n += 1
    tpl = TEMPLATE_DIR / "classic"
    if not tpl.is_dir():
        raise ApiError(500, "built-in template missing (templates/classic)")
    shutil.copytree(tpl, root)
    state.save_project_config(root, {"main_file": "main.tex", "target": "auto"})
    return open_project(st, str(root))


def recent(st) -> list[dict]:
    return st.get("recent_projects", [])


def current(st):
    pid = st.get("current_project")
    if not pid:
        return None
    p = Path(pid)
    if p.is_dir():
        cfg = state.load_project_config(p)
        resolved = str(p.resolve())
        return {
            "id": resolved,
            "name": p.name,
            "root": resolved,
            "main_file": cfg.get("main_file") or "main.tex",
            "target": cfg.get("target") or "auto",
            "auto_compile": bool(cfg.get("auto_compile", False)),
            "ssh": cfg.get("ssh") or None,
        }
    st.set("current_project", None)
    return None


def root_of(st) -> Path:
    """Current project root, or 409 if nothing is open."""
    cur = current(st)
    if not cur:
        raise ApiError(409, "no project open")
    return Path(cur["root"])