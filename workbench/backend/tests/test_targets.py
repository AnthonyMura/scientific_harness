"""Compile targets: subprocess plumbing must survive hostile TeX output."""

import types as _types
from pathlib import Path

import pytest

from workbench_backend import targets
from workbench_backend.errors import ApiError


def test_run_latexmk_replaces_undecodable_bytes(monkeypatch):
    # pdflatex can emit raw 8-bit bytes; Popen must decode with errors="replace"
    # or the pump thread dies on a UnicodeDecodeError (job stuck "running").
    captured = {}

    class FakePopen:
        def __init__(self, cmd, **kw):
            captured.update(kw)

    monkeypatch.setattr(targets.subprocess, "Popen", FakePopen)
    t = targets.LocalTarget()
    t.run_latexmk(Path("/tmp"), "main.tex", Path("/tmp/build"))
    assert captured.get("encoding") == "utf-8"
    assert captured.get("errors") == "replace"


class _FakeRun:
    """subprocess.run stand-in returning a fixed latexmk --version output."""

    def __init__(self, stdout="Latexmk, John Collins' version 4.86\n"):
        self.stdout = stdout
        self.calls = []

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        return _types.SimpleNamespace(stdout=self.stdout, stderr="", returncode=0)


def _fake_prefix(tmp_path):
    """A fake in-app TinyTeX prefix: <tmp>/bin/latexmk exists."""
    b = tmp_path / "bin"
    b.mkdir(parents=True, exist_ok=True)
    (b / "latexmk").write_text("")
    return tmp_path


def test_get_target_maps_issue58_names(tmp_path):
    assert isinstance(targets.get_target("tinytex", tmp_path), targets.TinyTexTarget)
    assert isinstance(targets.get_target("system", tmp_path), targets.SystemTarget)
    # "local" stays the backward-compatible composite alias (issue 58)
    assert isinstance(targets.get_target("local", tmp_path), targets.LocalTarget)


def test_get_target_unknown_still_400(tmp_path):
    with pytest.raises(ApiError) as ei:
        targets.get_target("bogus", tmp_path)
    assert ei.value.status == 400


def test_tinytex_target_refuses_without_prefix(monkeypatch, tmp_path):
    # No silent fallback to system TeX: missing prefix is a precise failure.
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: None)
    t = targets.TinyTexTarget()
    r = t.check()
    assert not r.ok
    assert "not installed" in r.detail and "Install panel" in r.detail
    with pytest.raises(ApiError):
        t.run_latexmk(tmp_path, "main.tex", tmp_path / "build")


def test_tinytex_target_uses_inapp_bin(monkeypatch, tmp_path):
    prefix = _fake_prefix(tmp_path)
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: prefix)
    monkeypatch.setattr(targets.tinytex, "bin_dir", lambda pfx: prefix / "bin")
    fake_run = _FakeRun()
    monkeypatch.setattr(targets.subprocess, "run", fake_run)
    t = targets.TinyTexTarget()
    r = t.check()
    assert r.ok and r.detail.startswith("in-app TinyTeX — ")
    assert fake_run.calls[0][0] == str(prefix / "bin" / "latexmk")

    captured = {}

    class FakePopen:
        def __init__(self, cmd, **kw):
            captured["cmd"] = cmd
            captured.update(kw)

    monkeypatch.setattr(targets.subprocess, "Popen", FakePopen)
    t.run_latexmk(tmp_path, "main.tex", tmp_path / "build")
    assert captured["cmd"][0] == str(prefix / "bin" / "latexmk")
    assert captured["env"]["PATH"].startswith(str(prefix / "bin"))


def test_system_target_ignores_inapp_prefix(monkeypatch, tmp_path):
    # A present in-app TinyTeX must NOT satisfy the system target (issue 58).
    prefix = _fake_prefix(tmp_path)
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: prefix)
    monkeypatch.setattr(targets.shutil, "which", lambda name: None)
    t = targets.SystemTarget()
    r = t.check()
    assert not r.ok and "no system TeX" in r.detail
    with pytest.raises(ApiError):
        t.run_latexmk(tmp_path, "main.tex", tmp_path / "build")


def test_system_target_uses_path_latexmk(monkeypatch, tmp_path):
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: None)
    monkeypatch.setattr(targets.shutil, "which", lambda name: "/usr/bin/latexmk")
    fake_run = _FakeRun()
    monkeypatch.setattr(targets.subprocess, "run", fake_run)
    t = targets.SystemTarget()
    r = t.check()
    assert r.ok and r.detail.startswith("system TeX — ")

    captured = {}

    class FakePopen:
        def __init__(self, cmd, **kw):
            captured["cmd"] = cmd
            captured.update(kw)

    monkeypatch.setattr(targets.subprocess, "Popen", FakePopen)
    t.run_latexmk(tmp_path, "main.tex", tmp_path / "build")
    assert captured["cmd"][0] == "/usr/bin/latexmk"
    # no env PATH injection: the system target never prepends the app prefix
    assert "env" not in captured


def test_local_target_still_composite_tinytex_first(monkeypatch, tmp_path):
    prefix = _fake_prefix(tmp_path)
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: prefix)
    monkeypatch.setattr(targets.tinytex, "bin_dir", lambda pfx: prefix / "bin")
    captured = {}

    class FakePopen:
        def __init__(self, cmd, **kw):
            captured["cmd"] = cmd

    monkeypatch.setattr(targets.subprocess, "Popen", FakePopen)
    targets.LocalTarget().run_latexmk(tmp_path, "main.tex", tmp_path / "build")
    assert captured["cmd"][0] == str(prefix / "bin" / "latexmk")


def test_local_target_falls_back_to_system(monkeypatch, tmp_path):
    monkeypatch.setattr(targets.tinytex, "find_prefix", lambda: None)
    monkeypatch.setattr(targets.shutil, "which", lambda name: "/usr/bin/latexmk")
    captured = {}

    class FakePopen:
        def __init__(self, cmd, **kw):
            captured["cmd"] = cmd

    monkeypatch.setattr(targets.subprocess, "Popen", FakePopen)
    targets.LocalTarget().run_latexmk(tmp_path, "main.tex", tmp_path / "build")
    # the composite's system leg invokes plain "latexmk" from PATH (targets.py)
    assert captured["cmd"][0] == "latexmk"
