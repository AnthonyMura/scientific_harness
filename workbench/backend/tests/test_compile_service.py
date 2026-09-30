"""Tests for CompileService._pump's repair/retry loop (issue 47).

The forced rerun after a package install must clear latexmk's state file
first: with the stale fdb, latexmk reports "All targets up-to-date" and exits
without re-running pdflatex, so the repair is never exercised.
"""
from __future__ import annotations

import threading

from workbench_backend import compile_service as cs
from workbench_backend.compile_service import CompileService


class FakeProc:
    def __init__(self, lines=(), rc=1):
        self.stdout = iter(lines)
        self._rc = rc

    def wait(self):
        return self._rc

    def poll(self):
        return None


class FakeTarget:
    name = "local"

    def __init__(self, procs):
        self.procs = list(procs)
        self.calls = []

    def run_latexmk(self, root, main_file, build_dir, force=False):
        self.calls.append(force)
        return self.procs.pop(0)

    def collect_artifacts(self, root, main_file, build_dir):
        pass


class FakeJob:
    def __init__(self):
        self.id = "job-1"
        self.lines = []
        self.errors = []
        self.artifacts = {}
        self.finished = None

    def log(self, line):
        self.lines.append(line)

    def text(self):
        return "".join(self.lines)

    def finish(self, status, exit_code=None):
        self.finished = (status, exit_code)


def _setup(tmp_path, monkeypatch, installed, first_lines, make_pdf=True):
    state = {"n": 0}

    def install(job, txt):
        # Report the install only on the first pass: a healthy install makes
        # the file exist, so later passes find nothing to do (loop stops).
        state["n"] += 1
        return list(installed) if state["n"] == 1 else []

    monkeypatch.setattr(cs.tinytex, "maybe_install_missing", install)
    build_dir = tmp_path / "build"
    build_dir.mkdir()
    fdb = build_dir / "russian.fdb_latexmk"
    fdb.write_text("stale state")
    if make_pdf:
        (build_dir / "russian.pdf").write_bytes(b"%PDF-1.5 fake")
    first = FakeProc(lines=first_lines, rc=1)
    second = FakeProc(lines=[], rc=12)
    target = FakeTarget([second])
    return build_dir, fdb, first, target


def test_stale_fdb_cleared_before_forced_rerun_after_install(tmp_path, monkeypatch):
    build_dir, fdb, first, target = _setup(
        tmp_path, monkeypatch, ["cyrillic"],
        ["Package fontenc Error: Encoding file `t2aenc.def' not found.\n"])
    svc = CompileService(None, None)
    job = FakeJob()
    svc._pump(job, first, tmp_path, "russian.tex", build_dir, threading.Event(), target)

    assert not fdb.exists()  # stale state cleared before the rerun
    assert target.calls == [True]  # exactly one forced rerun
    assert job.finished == ("done", 12)
    assert any("retrying compile after installing: cyrillic" in l for l in job.lines)


def test_stale_refusal_without_install_clears_fdb_and_forces(tmp_path, monkeypatch):
    build_dir, fdb, first, target = _setup(
        tmp_path, monkeypatch, [],
        ["Latexmk: giving up: file gave an error in previous invocation.\n",
         "Latexmk: All targets (build/russian.pdf) are up-to-date\n"])
    svc = CompileService(None, None)
    job = FakeJob()
    svc._pump(job, first, tmp_path, "russian.tex", build_dir, threading.Event(), target)

    assert not fdb.exists()
    assert target.calls == [True]
    assert job.finished == ("done", 12)
    assert any("retrying after clearing stale latexmk state" in l for l in job.lines)


def test_no_repair_stops_without_clearing_fdb(tmp_path, monkeypatch):
    build_dir, fdb, first, target = _setup(
        tmp_path, monkeypatch, [], ["Some unrelated fatal error.\n"], make_pdf=False)
    svc = CompileService(None, None)
    job = FakeJob()
    svc._pump(job, first, tmp_path, "russian.tex", build_dir, threading.Event(), target)

    assert fdb.exists()  # untouched: no repair, no stale-refusal marker
    assert target.calls == []  # no rerun at all
    assert job.finished == ("error", 1)
