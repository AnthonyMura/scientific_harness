"""Persistent state: one global JSON file + per-project config. No database in v0.

Global state: %APPDATA%/Workbench/state.json (Windows),
~/.config/workbench/state.json (Linux/macOS). Per-project settings live in
<project>/.workbench/project.json next to the sources.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

APP_DIR_NAME = "Workbench"
PROJECT_DIRNAME = ".workbench"
BUILD_DIRNAME = "build"


def app_data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData/Roaming"))
        return base / APP_DIR_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support" / APP_DIR_NAME
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "workbench"


def write_json(path: Path, obj) -> None:
    """In-place write (open-write-close). No temp+rename: atomic rename is
    unsupported on some shares (UNC/WSL), and v0 accepts the small risk."""
    text = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


class State:
    """Global app state (recent projects, current project, global prefs)."""

    def __init__(self) -> None:
        d = app_data_dir()
        d.mkdir(parents=True, exist_ok=True)
        self.path = d / "state.json"
        data = read_json(self.path, {})
        self.data = data if isinstance(data, dict) else {}

    def save(self) -> None:
        write_json(self.path, self.data)

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def set(self, key: str, value) -> None:
        self.data[key] = value
        self.save()


# --- per-project config -------------------------------------------------

def project_config_path(root: Path) -> Path:
    return root / PROJECT_DIRNAME / "project.json"


def build_dir(root: Path) -> Path:
    return root / PROJECT_DIRNAME / BUILD_DIRNAME


def load_project_config(root: Path) -> dict:
    cfg = read_json(project_config_path(root), {})
    return cfg if isinstance(cfg, dict) else {}


def save_project_config(root: Path, cfg: dict) -> None:
    p = project_config_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    write_json(p, cfg)