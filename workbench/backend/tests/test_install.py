"""Install probes (issue 58): the combined local entry split into tinytex + system."""

import types as _types

import pytest

from workbench_backend import install
from workbench_backend.errors import ApiError


class FakeJobs:
    def create(self, kind, label):
        return _types.SimpleNamespace(id="j1", kind=kind, label=label)


class SyncThread:
    """threading.Thread stand-in that runs the target synchronously."""

    def __init__(self, target=None, args=(), **kw):
        self._t = target
        self._a = args

    def start(self):
        self._t(*self._a)


def _bare_host(monkeypatch):
    """Fake linux host with no TeX anywhere."""
    monkeypatch.setattr(install, "host_os", lambda: "linux")
    monkeypatch.setattr(install.tinytex, "find_prefix", lambda: None)
    monkeypatch.setattr(install.shutil, "which", lambda name: None)


def test_status_splits_tinytex_and_system(monkeypatch):
    _bare_host(monkeypatch)
    out = install.status({})
    by_name = {e.name: e for e in out}
    assert "tinytex" in by_name and "system" in by_name
    assert "local" not in by_name  # the combined entry is gone (issue 58)
    assert by_name["tinytex"].recommended
    assert not by_name["tinytex"].tex_found
    assert "not installed" in by_name["tinytex"].detail
    assert by_name["tinytex"].can_install
    assert not by_name["system"].tex_found
    assert "(PATH)" in by_name["system"].detail


def test_status_tinytex_found(monkeypatch, tmp_path):
    b = tmp_path / "bin"
    b.mkdir()
    (b / "latexmk").write_text("")
    monkeypatch.setattr(install.tinytex, "find_prefix", lambda: tmp_path)
    monkeypatch.setattr(install.tinytex, "bin_dir", lambda pfx: b)
    monkeypatch.setattr(install.tinytex, "version_lines", lambda pfx: "TeX Live (2026.1)")
    monkeypatch.setattr(install.shutil, "which", lambda name: None)
    monkeypatch.setattr(install, "host_os", lambda: "linux")
    out = install.status({})
    tt = next(e for e in out if e.name == "tinytex")
    assert tt.tex_found and "TeX Live" in tt.version


def test_start_install_accepts_system_and_local(monkeypatch):
    calls = []
    monkeypatch.setattr(install, "local_install_spec", lambda: (["true"], "hint"))
    monkeypatch.setattr(install, "_pump_install", lambda job, cmd: calls.append((job.label, cmd)))
    monkeypatch.setattr(install.threading, "Thread", SyncThread)
    for name in ("system", "local"):
        assert install.start_install({}, FakeJobs(), name) == "j1"
    assert all(label == "install TeX (system)" for label, _cmd in calls)
    assert len(calls) == 2


def test_start_install_unknown_target_400():
    with pytest.raises(ApiError) as ei:
        install.start_install({}, FakeJobs(), "bogus")
    assert ei.value.status == 400
