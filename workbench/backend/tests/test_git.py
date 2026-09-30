"""Tests for the git service — issue 56: default .gitignore on repo init and the
untracked-directory status entry shape that the Git module's folder rows rely on."""

import subprocess
from pathlib import Path

import pytest

from workbench_backend import git as gitsvc

pytestmark = pytest.mark.skipif(
    not gitsvc.git_available(), reason="git binary not available"
)


def _init_repo(root: Path) -> None:
    (root / "main.tex").write_text(
        "\\documentclass{article}\n\\begin{document}hi\\end{document}\n", encoding="utf-8"
    )
    res = gitsvc.init_and_commit(root, "test: baseline")
    assert res["committed"], res


def test_init_and_commit_writes_default_gitignore(tmp_path):
    _init_repo(tmp_path)
    gi = tmp_path / ".gitignore"
    assert gi.exists()
    text = gi.read_text(encoding="utf-8")
    for line in (".workbench/", "versions/*.pdf", "*.aux"):
        assert line in text, f"{line!r} missing from default .gitignore"


def test_default_gitignore_lands_in_baseline_commit(tmp_path):
    _init_repo(tmp_path)
    out = subprocess.run(
        ["git", "-C", str(tmp_path), "ls-files"], capture_output=True, text=True
    ).stdout.splitlines()
    assert ".gitignore" in out


def test_init_does_not_overwrite_existing_gitignore(tmp_path):
    (tmp_path / ".gitignore").write_text("custom-artifacts/\n", encoding="utf-8")
    _init_repo(tmp_path)
    assert (tmp_path / ".gitignore").read_text(encoding="utf-8") == "custom-artifacts/\n"


def test_write_default_gitignore_returns_flag(tmp_path):
    assert gitsvc.write_default_gitignore(tmp_path) is True
    assert gitsvc.write_default_gitignore(tmp_path) is False  # already exists


def test_init_only_writes_gitignore_as_untracked_change(tmp_path):
    res = gitsvc.init_only(tmp_path)
    assert res["repo"] and not res["initialized"], res
    assert (tmp_path / ".gitignore").exists()
    st = gitsvc.workbench_status(tmp_path)
    by_path = {e["path"]: e for e in st["changes"]}
    assert by_path[".gitignore"]["badge"] == "A"


def test_untracked_dir_status_entry_has_trailing_slash_and_badge_a(tmp_path):
    _init_repo(tmp_path)
    (tmp_path / "versions").mkdir()
    (tmp_path / "versions" / "README.md").write_text("milestones\n", encoding="utf-8")
    st = gitsvc.workbench_status(tmp_path)
    dirs = [e for e in st["changes"] if e["path"].endswith("/")]
    assert {"path": "versions/", "badge": "A"} in dirs
