"""Minimal system-git service: repo detection, init + baseline commit, commit-all.

Issue 43 needs exactly three things from git and nothing more: new projects
get a repository with a baseline commit, the fill flow reports whether the
project is a repository (and offers to initialize one), and the fill success
state can commit what it created. The sidecar shells out to the system `git`
binary; its absence never blocks project work — every function degrades
gracefully instead of raising.

Deliberately NOT in scope here (issue 42 owns the broader git story): status,
diffs, branches, remotes, history UI.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .errors import ApiError


def git_available() -> bool:
    return shutil.which("git") is not None


def _git(root: Path, *args: str, timeout: int = 30) -> tuple[int | None, str]:
    """Run git in `root`; returns (returncode, combined output). rc None = git missing."""
    try:
        p = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True, text=True, timeout=timeout,
        )
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except FileNotFoundError:
        return None, ""
    except (subprocess.TimeoutExpired, OSError):
        return None, "git timed out"


def _identity_args(root: Path) -> list[str]:
    """-c user.name/-c user.email fallbacks when no identity is configured.

    Lab machines often have git but no identity; commits must not fail there.
    """
    rc, out = _git(root, "config", "user.email")
    if rc == 0 and out.strip():
        return []
    return ["-c", "user.name=Workbench", "-c", "user.email=workbench@localhost"]


def repo_status(root: Path) -> dict:
    """{repo, initialized}: is root inside a git work tree, does it have >= 1 commit?"""
    rc, out = _git(root, "rev-parse", "--is-inside-work-tree")
    if rc != 0 or "true" not in out:
        return {"repo": False, "initialized": False}
    rc2, _ = _git(root, "rev-parse", "-q", "HEAD")
    return {"repo": True, "initialized": rc2 == 0}


def init_and_commit(root: Path, message: str) -> dict:
    """git init + add -A + baseline commit. Never raises; reports what happened."""
    if not git_available():
        return {
            "repo": False, "initialized": False, "committed": False,
            "detail": "git binary not found — project created without a repository",
        }
    rc, out = _git(root, "init", "-b", "main")
    if rc != 0:
        # Older git without `init -b`: plain init (default branch name kept).
        rc, out = _git(root, "init")
        if rc != 0:
            return {
                "repo": False, "initialized": False, "committed": False,
                "detail": out or "git init failed",
            }
    _git(root, "add", "-A")
    rc, out = _git(root, *(_identity_args(root)), "commit", "-m", message)
    if rc == 0:
        return {"repo": True, "initialized": True, "committed": True, "detail": ""}
    # Empty tree (e.g. everything ignored by .gitignore): the repo exists but
    # has no commit yet — initialized stays False so the UI can offer a commit.
    return {
        "repo": True, "initialized": False, "committed": False,
        "detail": out or "git commit failed",
    }


def commit_all(root: Path, message: str) -> None:
    """git add -A + commit in an existing repo. Raises ApiError on failure."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")
    _git(root, "add", "-A")
    rc, out = _git(root, *(_identity_args(root)), "commit", "-m", message)
    if rc == 0:
        return
    if "nothing to commit" in out or "no changes added" in out:
        raise ApiError(409, "nothing to commit")
    raise ApiError(500, out or "git commit failed")
