"""Project open/create/recent. A project is a folder; its identity is its path."""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path

from . import git as gitsvc
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


def _read_manifest(tpl_dir: Path) -> dict:
    """Optional manifest.json for a template folder; {} when absent or malformed."""
    m = tpl_dir / "manifest.json"
    if m.is_file():
        try:
            data = json.loads(m.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (OSError, ValueError):
            pass
    return {}


def _template_files(tpl_dir: Path) -> list[str]:
    """Every template file as a sorted posix relative path (manifest.json excluded)."""
    out = []
    for p in tpl_dir.rglob("*"):
        if not p.is_file() or p.name == "manifest.json":
            continue
        out.append(p.relative_to(tpl_dir).as_posix())
    return sorted(out)


def list_templates() -> list[dict]:
    """Built-in templates for the picker: default first, then by id."""
    tpls = []
    if TEMPLATE_DIR.is_dir():
        for d in sorted(TEMPLATE_DIR.iterdir()):
            if not d.is_dir() or d.name.startswith("."):
                continue
            m = _read_manifest(d)
            tpls.append({
                "id": d.name,
                "name": m.get("name") or d.name,
                "description": m.get("description") or "",
                "kind": m.get("kind") or "latex",
                "main_file": m.get("main_file") or "main.tex",
                "tex_packages": list(m.get("tex_packages") or []),
                "files": _template_files(d),
                "default": bool(m.get("default")),
            })
    tpls.sort(key=lambda t: (not t["default"], t["id"]))
    return tpls


def template_manifest(tpl_id: str) -> dict:
    """Manifest for one built-in template; 404 if unknown. Used by install.py."""
    d = TEMPLATE_DIR / tpl_id
    if not d.is_dir():
        raise ApiError(404, f"unknown template: {tpl_id}")
    return _read_manifest(d)


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
        "template": cfg.get("template") or None,
    }
    st.set("current_project", proj["id"])
    recents = [r for r in st.get("recent_projects", []) if r.get("id") != proj["id"]]
    recents.insert(0, proj)
    st.set("recent_projects", recents[:20])
    return proj


def _default_template_id() -> str:
    for t in list_templates():
        if t["default"]:
            return t["id"]
    return "classic"


def new_project(st, name: str, location: str | None = None, template: str | None = None) -> dict:
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
    tpl_id = template or _default_template_id()
    tpl = TEMPLATE_DIR / tpl_id
    if not tpl.is_dir():
        if template is None:
            raise ApiError(500, f"built-in template missing (templates/{tpl_id})")
        raise ApiError(404, f"unknown template: {template}")
    m = _read_manifest(tpl)
    # manifest.json is metadata about the template, never project content.
    shutil.copytree(tpl, root, ignore=shutil.ignore_patterns("manifest.json"))
    state.save_project_config(
        root, {"main_file": m.get("main_file") or "main.tex", "target": "auto", "template": tpl_id}
    )
    proj = open_project(st, str(root))
    # git: init + baseline commit; a missing binary or failure never blocks creation.
    if gitsvc.git_available():
        info = gitsvc.init_and_commit(root, f"scaffold: create from template {tpl_id}")
        proj["git"] = {"repo": info["repo"], "initialized": info["initialized"]}
    else:
        proj["git"] = {"repo": False, "initialized": False}
    return proj


def fill_project(st, template: str, apply: bool = False) -> dict:
    """Dry-run/apply 'Fill with structure' on the current project (issue 43).

    Never overwrites, deletes or modifies existing files: `create` lists the
    template files missing from the project, `skip` the ones already present.
    Apply copies exactly the create list and records the template in the
    project config (provenance); a second apply therefore creates nothing.
    """
    root = root_of(st)
    tpl_dir = TEMPLATE_DIR / template
    if not tpl_dir.is_dir():
        raise ApiError(404, f"unknown template: {template}")
    m = _read_manifest(tpl_dir)
    create, skip = [], []
    for rel in _template_files(tpl_dir):
        (skip if (root / rel).is_file() else create).append(rel)
    result = {
        "template": template,
        "create": create,
        "skip": skip,
        "git": gitsvc.repo_status(root),
    }
    if apply:
        for rel in create:
            dst = root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(tpl_dir / rel, dst)
        cfg = state.load_project_config(root)
        cfg["template"] = template
        state.save_project_config(root, cfg)
        result["applied"] = True
    warning = _fill_warning(root, m.get("kind") or "latex")
    if warning:
        result["warning"] = warning
    return result


def _fill_warning(root: Path, kind: str) -> str | None:
    """Warn when a LaTeX template is being filled into a markdown-only project."""
    if kind != "latex":
        return None
    tex = md = 0
    capped = False
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", ".workbench", "node_modules")]
        for fn in filenames:
            if fn.endswith(".tex"):
                tex += 1
            elif fn.lower().endswith((".md", ".markdown")):
                md += 1
            if tex + md > 5000:
                capped = True
                break
        if capped:
            break
    if not capped and tex == 0 and md > 0:
        return (
            "This project has no .tex files yet — it looks like a markdown-only "
            "project. The LaTeX structure will be added alongside the existing files."
        )
    return None


def recent(st) -> list[dict]:
    return st.get("recent_projects", [])


def remove_recent(st, project_id: str) -> list[dict]:
    """Remove one entry from the recent-projects list (issue 45).

    History-only edit: the project folder on disk is untouched. Returns the
    updated list so the client can sync its copy without a full refetch.
    """
    recents = st.get("recent_projects", [])
    remaining = [r for r in recents if r.get("id") != project_id]
    if len(remaining) == len(recents):
        raise ApiError(404, f"not in recent projects: {project_id}")
    st.set("recent_projects", remaining)
    return remaining


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
            "template": cfg.get("template") or None,
        }
    st.set("current_project", None)
    return None


def root_of(st) -> Path:
    """Current project root, or 409 if nothing is open."""
    cur = current(st)
    if not cur:
        raise ApiError(409, "no project open")
    return Path(cur["root"])