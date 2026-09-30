"""Compile targets: subprocess plumbing must survive hostile TeX output."""

from pathlib import Path

from workbench_backend import targets


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
