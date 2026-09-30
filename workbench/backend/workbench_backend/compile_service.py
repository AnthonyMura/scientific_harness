"""Compile lifecycle: start latexmk per target, stream the log, parse errors,
collect PDF + synctex into the build directory (plan section 3)."""

from __future__ import annotations

import subprocess
import threading
import traceback
from pathlib import Path

from . import state, tinytex
from .errors import ApiError, ErrorParser
from .jobs import JobRegistry
from .targets import get_target

# A cascade of missing packages can need one retry per install round (a
# Russian document: ragged2e -> T2A encoding -> babel-russian -> multirow);
# 3 passes was not enough (issue 47). Each extra pass costs one latexmk run,
# and the loop still stops as soon as a pass installs nothing new.
MAX_COMPILE_ATTEMPTS = 6


class CompileService:
    def __init__(self, st, jobs: JobRegistry) -> None:
        self.st = st
        self.jobs = jobs
        self._procs: dict[str, subprocess.Popen] = {}
        self._cancel: dict[str, threading.Event] = {}
        self._failed_roots: set[str] = set()
        self._lock = threading.Lock()

    def start(self, root: Path, main_file: str | None, target_name: str | None) -> str:
        cfg = state.load_project_config(root)
        target_name = target_name or cfg.get("target") or "auto"
        main_file = main_file or cfg.get("main_file") or "main.tex"
        if not (root / main_file).is_file():
            raise ApiError(404, f"main file not found: {main_file}")
        target = get_target(target_name, root)
        build_dir = state.build_dir(root)
        build_dir.mkdir(parents=True, exist_ok=True)

        job = self.jobs.create("compile", f"{target.name}: {main_file}")
        # A previously failed compile leaves latexmk's state file behind, and
        # latexmk then reports "gave an error in previous invocation" and
        # refuses to rerun pdflatex for unchanged files — clear it.
        if str(root) in self._failed_roots:
            for f in build_dir.glob("*.fdb_latexmk"):
                try:
                    f.unlink()
                except OSError:
                    pass
            job.log("cleared stale latexmk state from the previous failed compile")
        cancel_evt = threading.Event()
        try:
            proc = target.run_latexmk(root, main_file, build_dir)
        except ApiError:
            raise
        except Exception as e:  # report any spawn failure to the UI
            job.finish("error", None)
            job.log(f"failed to start latexmk: {e}")
            return job.id
        with self._lock:
            self._procs[job.id] = proc
            self._cancel[job.id] = cancel_evt
        threading.Thread(
            target=self._pump,
            args=(job, proc, root, main_file, build_dir, cancel_evt, target),
            daemon=True,
        ).start()
        return job.id

    def cancel(self, job_id: str) -> None:
        with self._lock:
            evt = self._cancel.get(job_id)
            proc = self._procs.get(job_id)
        if evt:
            evt.set()
        if proc and proc.poll() is None:
            # v0: kill the direct child only. Under the wsl target this stops
            # the wsl.exe session on most setups; a full process-group kill is
            # a polish item (plan M1).
            try:
                proc.kill()
            except OSError:
                pass

    def _pump(self, job, proc, root, main_file, build_dir, cancel_evt, target) -> None:
        parser = ErrorParser()
        stem = Path(main_file).stem

        def clear_fdb() -> None:
            for f in build_dir.glob("*.fdb_latexmk"):
                try:
                    f.unlink()
                except OSError:
                    pass

        rc: int | None = None
        try:
            for _attempt in range(MAX_COMPILE_ATTEMPTS):
                job.log(f"--- compile attempt {_attempt + 1} ---")
                rc = None
                assert proc.stdout is not None
                attempt_lines: list[str] = []
                for line in proc.stdout:
                    job.log(line)
                    parser.feed(line)
                    attempt_lines.append(line)
                rc = proc.wait()
                if rc == 0 or cancel_evt.is_set():
                    break
                txt = job.text()
                # In-app TinyTeX maintenance: install the packages named in
                # the failure log, then retry. System TeX is never modified.
                installed = tinytex.maybe_install_missing(job, txt)
                if not installed and "gave an error in previous invocation" in "".join(attempt_lines):
                    # This run itself refused to do anything (stale latexmk
                    # state from a killed job): clear it and force a rerun.
                    # Checked against this attempt's output only, so the
                    # marker cannot keep retriggering on accumulated text.
                    clear_fdb()
                    job.log("--- retrying after clearing stale latexmk state ---")
                    try:
                        proc = target.run_latexmk(root, main_file, build_dir, force=True)
                    except Exception as e:
                        job.log(f"failed to restart latexmk: {e}")
                        break
                    continue
                if not installed:
                    # No repair found: stop retrying. A partial PDF left by a
                    # failed run is no reason to stop (rc == 0 breaks above;
                    # stale state is handled by the fdb-clear path).
                    break
                job.log(f"--- retrying compile after installing: {', '.join(installed)} ---")
                try:
                    # -f: latexmk otherwise keeps the cached error state and
                    # refuses to rerun pdflatex for an unchanged input file.
                    proc = target.run_latexmk(root, main_file, build_dir, force=True)
                except Exception as e:
                    job.log(f"failed to restart latexmk: {e}")
                    break
        except Exception as e:  # a dead thread would leave the job "running" forever
            traceback.print_exc()
            job.log(f"internal compile error: {type(e).__name__}: {e}")
        try:
            target.collect_artifacts(root, main_file, build_dir)
        except Exception as e:  # artifact pull-back must not mask the compile result
            job.log(f"failed to collect artifacts from the remote: {e}")
        job.errors.extend(parser.errors)
        pdf = build_dir / f"{stem}.pdf"
        synctex = build_dir / f"{stem}.synctex.gz"
        if pdf.exists():
            job.artifacts["pdf"] = pdf.name
        if synctex.exists():
            job.artifacts["synctex"] = synctex.name
        with self._lock:
            self._procs.pop(job.id, None)
            self._cancel.pop(job.id, None)
        # latexmk exits 12 when everything is already up-to-date ("Nothing
        # to do"): with a PDF on disk that is a successful compile, not an
        # error (a stale-error fdb is handled by the marker path above).
        ok = (rc == 0 or rc == 12) and pdf.exists()
        if ok:
            self._failed_roots.discard(str(root))
        else:
            self._failed_roots.add(str(root))
        if cancel_evt.is_set():
            job.finish("cancelled", rc)
        else:
            job.finish("done" if ok else "error", rc)