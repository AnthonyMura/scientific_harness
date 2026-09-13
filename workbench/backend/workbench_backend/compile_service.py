"""Compile lifecycle: start latexmk per target, stream the log, parse errors,
collect PDF + synctex into the build directory (plan section 3)."""

from __future__ import annotations

import subprocess
import threading
from pathlib import Path

from . import state
from .errors import ApiError, ErrorParser
from .jobs import JobRegistry
from .targets import get_target


class CompileService:
    def __init__(self, st, jobs: JobRegistry) -> None:
        self.st = st
        self.jobs = jobs
        self._procs: dict[str, subprocess.Popen] = {}
        self._cancel: dict[str, threading.Event] = {}
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
            args=(job, proc, root, main_file, build_dir, cancel_evt),
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

    def _pump(self, job, proc, root, main_file, build_dir, cancel_evt) -> None:
        parser = ErrorParser()
        assert proc.stdout is not None
        for line in proc.stdout:
            job.log(line)
            parser.feed(line)
        rc = proc.wait()
        job.errors.extend(parser.errors)
        stem = Path(main_file).stem
        pdf = build_dir / f"{stem}.pdf"
        synctex = build_dir / f"{stem}.synctex.gz"
        if pdf.exists():
            job.artifacts["pdf"] = pdf.name
        if synctex.exists():
            job.artifacts["synctex"] = synctex.name
        with self._lock:
            self._procs.pop(job.id, None)
            self._cancel.pop(job.id, None)
        if cancel_evt.is_set():
            job.finish("cancelled", rc)
        else:
            job.finish("done" if rc == 0 else "error", rc)