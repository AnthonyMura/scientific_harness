"""In-memory job registry shared by compile and install runs.

Jobs stream their output line-by-line; the UI polls `snapshot(since=n)` for
new lines. Jobs live only as long as the sidecar process.
"""

from __future__ import annotations

import itertools
import threading


class Job:
    def __init__(self, kind: str, label: str):
        self.id = ""
        self.kind = kind  # "compile" | "install"
        self.label = label
        self.status = "running"  # running | done | error | cancelled
        self.exit_code: int | None = None
        self.errors: list[dict] = []
        self.artifacts: dict = {}
        self._log: list[str] = []
        self._lock = threading.Lock()

    def log(self, line: str) -> None:
        with self._lock:
            self._log.append(line.rstrip("\r\n"))

    def text(self) -> str:
        with self._lock:
            return "\n".join(self._log)

    def finish(self, status: str, exit_code: int | None = None) -> None:
        with self._lock:
            self.status = status
            self.exit_code = exit_code

    def snapshot(self, since: int = 0) -> dict:
        with self._lock:
            return {
                "id": self.id,
                "kind": self.kind,
                "label": self.label,
                "status": self.status,
                "exit_code": self.exit_code,
                "log": self._log[since:],
                "errors": list(self.errors),
                "artifacts": dict(self.artifacts),
                "total_lines": len(self._log),
            }


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._ids = itertools.count(1)
        self._lock = threading.Lock()

    def create(self, kind: str, label: str) -> Job:
        with self._lock:
            job = Job(kind, label)
            job.id = f"{kind}-{next(self._ids)}"
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)