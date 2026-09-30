"""Starter suite for the in-memory job registry (workbench_backend.jobs)."""

from workbench_backend.jobs import Job, JobRegistry


def test_registry_assigns_sequential_ids():
    reg = JobRegistry()
    a = reg.create("compile", "main.tex")
    b = reg.create("install", "texlive")
    assert a.id == "compile-1"
    assert b.id == "install-2"
    assert reg.get(a.id) is a
    assert reg.get("nope") is None


def test_job_log_strips_newlines_and_snapshots_incrementally():
    job = Job("compile", "main.tex")
    job.log("line one\n")
    job.log("line two\r\n")
    assert job.text() == "line one\nline two"
    first = job.snapshot(since=0)
    assert first["log"] == ["line one", "line two"]
    assert first["total_lines"] == 2
    job.log("line three\n")
    delta = job.snapshot(since=first["total_lines"])
    assert delta["log"] == ["line three"]
    assert delta["total_lines"] == 3


def test_job_finish_records_status_and_exit_code():
    job = Job("install", "texlive")
    assert job.status == "running"
    job.finish("done", exit_code=0)
    snap = job.snapshot()
    assert snap["status"] == "done"
    assert snap["exit_code"] == 0


def test_snapshot_copies_errors_and_artifacts():
    job = Job("compile", "main.tex")
    job.errors.append({"line": 3, "message": "Undefined control sequence."})
    job.artifacts["pdf"] = "out/main.pdf"
    snap = job.snapshot()
    assert snap["errors"] == [{"line": 3, "message": "Undefined control sequence."}]
    assert snap["artifacts"] == {"pdf": "out/main.pdf"}
