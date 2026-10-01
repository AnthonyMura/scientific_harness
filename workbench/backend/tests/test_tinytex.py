# Tests for in-app TinyTeX missing-package repair (workbench_backend.tinytex)
# and the compile retry cascade (compile_service). Issue 47: Russian docs
# need encoding (.def) files + babel language modules, which the on-demand
# installer previously missed (fontenc's lowercase "file ... not found",
# babel "Unknown option", and a tlmgr-search parse broken by the banner line).

import threading
from pathlib import Path

from workbench_backend import tinytex
from workbench_backend.compile_service import MAX_COMPILE_ATTEMPTS, CompileService
from workbench_backend.jobs import Job, JobRegistry


# --- log parsing -------------------------------------------------------------


def test_missing_file_regex_case_and_quote_styles():
    # Both real forms: capital-F "File `x.sty' not found" (LaTeX core) and
    # lowercase fontenc "Encoding file `t2aenc.def' not found".
    m = tinytex.MISSING_FILE_RE.search(r"! LaTeX Error: File `ragged2e.sty' not found.")
    assert m and m.group(1) == "ragged2e.sty"
    log = "Package fontenc Error: Encoding file `t2aenc.def' not found.\n"
    m = tinytex.MISSING_FILE_RE.search(log)
    assert m and m.group(1) == "t2aenc.def"


def test_babel_lang_regex_extracts_language():
    log = "! Package babel Error: Unknown option 'russian'.\n"
    m = tinytex.BABEL_LANG_RE.search(log)
    assert m and m.group(1) == "russian"
    assert not tinytex.BABEL_LANG_RE.search("Package babel Info: something else")


# --- package resolution -------------------------------------------------------


class FakeRun:
    # Stands in for tinytex._run; keyed by the last cmd arg (the file name).
    def __init__(self, outputs=None):
        self.calls = []
        self.outputs = outputs or {}

    def __call__(self, cmd, timeout=120):
        self.calls.append(cmd)
        return self.outputs.get(cmd[-1], (0, ""))


def test_pkg_for_file_mapping_needs_no_network(monkeypatch):
    def boom(cmd, timeout=120):
        raise AssertionError("tlmgr search must not run for mapped files")

    monkeypatch.setattr(tinytex, "_run", boom)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "t2aenc.def") == "cyrillic"
    assert tinytex._pkg_for_file(Path("/fake/bin"), "russian.ldf") == "babel-russian"
    assert tinytex._pkg_for_file(Path("/fake/bin"), "amssymb.sty") == "amsfonts"


def test_pkg_for_file_parses_search_past_banner(monkeypatch):
    # Real tlmgr output: a banner line first, then "<pkg>:" header lines.
    out = (
        "tlmgr: package repository https://tlnet.yihui.org (verified)\n"
        "babel-english:\n"
        "\ttexmf-dist/tex/generic/babel-english/english.ldf\n"
    )
    fake = FakeRun({"/english.ldf": (0, out)})
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "english.ldf") == "babel-english"


def test_pkg_for_file_fallbacks(monkeypatch):
    # Mirror without the file in its index: .ldf -> babel-<lang>, else basename.
    fake = FakeRun()
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "ukrainian.ldf") == "babel-ukrainian"
    assert tinytex._pkg_for_file(Path("/fake/bin"), "somepkg.sty") == "somepkg"


def test_pkg_for_file_biblatex_style_resolves_per_style_package(monkeypatch):
    # TL2026 ships each citation style as a per-style package; the partial
    # mirror's file index lacks the .bbx entry, so tlmgr search finds nothing
    # and the `tlmgr info` candidate check decides (issue 59).
    out = "package:     biblatex-vancouver\n"
    fake = FakeRun({
        "/vancouver.bbx": (1, ""),   # not in this mirror's file index
        "biblatex-vancouver": (0, out),
    })
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "vancouver.bbx") == "biblatex-vancouver"
    assert tinytex._pkg_for_file(Path("/fake/bin"), "vancouver.cbx") == "biblatex-vancouver"


def test_pkg_for_file_biblatex_style_falls_back_to_extra_or_guess(monkeypatch):
    # Pre-TL2026 tree: the extras live in one biblatex-extra package; with an
    # empty index the guess is still biblatex-<style> so tlmgr install reports
    # if it is bogus.
    out = "package:     biblatex-extra\n"
    fake = FakeRun({
        "/chicago.bbx": (1, ""),
        "biblatex-chicago": (0, ""),   # no entry in this index
        "biblatex-extra": (0, out),
    })
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "chicago.bbx") == "biblatex-extra"
    fake2 = FakeRun()
    monkeypatch.setattr(tinytex, "_run", fake2)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "vancouver.bbx") == "biblatex-vancouver"


# --- maybe_install_missing ----------------------------------------------------

CASCADE_LOG = (
    "! LaTeX Error: File `ragged2e.sty' not found.\n"
    "Package fontenc Error: Encoding file `t2aenc.def' not found.\n"
    "! Package babel Error: Unknown option 'russian'.\n"
)


def _install_env(monkeypatch, present=(), pkgs=()):
    monkeypatch.setattr(tinytex, "find_prefix", lambda: Path("/fake/prefix"))
    monkeypatch.setattr(tinytex, "bin_dir", lambda p: Path("/fake/bin"))
    files = set(present)

    def file_present(b, f):
        return f in files

    monkeypatch.setattr(tinytex, "_file_present", file_present)
    monkeypatch.setattr(tinytex, "_pkg_installed", lambda b, pkg: pkg in pkgs)
    monkeypatch.setattr(tinytex, "_run", FakeRun())
    names = []
    # A successful install materializes the files its package provides - a
    # healthy mirror. Partial-mirror tests override _tlmgr_install/_file_present.
    PKG_FILES = {
        "ragged2e": ("ragged2e.sty",),
        "cyrillic": ("t2aenc.def",),
        "lh": ("larm1000.mf", "lasx1000.mf"),
        "biblatex-vancouver": ("vancouver.bbx", "vancouver.cbx"),
    }

    def fake_install(b, pkg, job=None, repository=None):
        names.append(pkg)
        files.update(PKG_FILES.get(pkg, ()))
        return True

    monkeypatch.setattr(tinytex, "_tlmgr_install", fake_install)
    return Job("compile", "main.tex"), names


def test_russian_cascade_installs_encoding_babel_and_hyphenation(monkeypatch):
    job, names = _install_env(monkeypatch)
    installed = tinytex.maybe_install_missing(job, CASCADE_LOG)
    # order: missing .sty first (log order), then encoding, then babel lang,
    # with best-effort hyphenation patterns after the .ldf install
    assert installed == ["ragged2e", "cyrillic", "babel-russian", "hyphen-russian"]
    assert names == installed
    txt = job.text()
    assert "missing t2aenc.def" in txt and "cyrillic" in txt


def test_idempotent_when_files_present(monkeypatch):
    # Babel language presence is judged by package state, not by files.
    present = ("ragged2e.sty", "t2aenc.def")
    job, names = _install_env(monkeypatch, present=present, pkgs=("babel-russian",))
    assert tinytex.maybe_install_missing(job, CASCADE_LOG) == []
    assert names == []


def test_skips_document_files_and_absolute_paths(monkeypatch):
    log = (
        "! LaTeX Error: File `main.tex' not found.\n"
        "File `/tmp/abs.sty' not found.\n"
        "File `fig.png' not found.\n"
    )
    job, names = _install_env(monkeypatch)
    assert tinytex.maybe_install_missing(job, log) == []
    assert names == []


def test_dedupes_repeated_missing_files(monkeypatch):
    log = CASCADE_LOG + "! LaTeX Error: File `ragged2e.sty' not found.\n"
    job, names = _install_env(monkeypatch)
    installed = tinytex.maybe_install_missing(job, log)
    assert installed.count("ragged2e") == 1



def test_biblatex_style_log_installs_per_style_package_once(monkeypatch):
    # Real andrology failure (issue 59): missing vancouver.bbx/.cbx must
    # install biblatex-vancouver - not the bogus basename package `vancouver`
    # - and both files resolve to one package, installed once.
    log = (
        "Package biblatex Info: Trying to load bibliography style 'vancouver'...\n"
        "Package biblatex Info: ... file 'vancouver.bbx' not found.\n"
        "Package biblatex Info: ... file 'vancouver.cbx' not found.\n"
    )
    job, names = _install_env(monkeypatch)
    installed = tinytex.maybe_install_missing(job, log)
    assert installed == ["biblatex-vancouver"]
    assert names == ["biblatex-vancouver"]


def test_biblatex_stale_lsr_healed_by_ctan_reinstall(monkeypatch):
    # The exact andrology situation (issue 59): biblatex-vancouver is
    # installed on disk but kpathsea's ls-R is stale, so the file is invisible.
    # tlmgr install succeeds ("already present") yet the file is still missing
    # -> one CTAN retry re-extracts and refreshes ls-R.
    job, _names = _install_env(monkeypatch, pkgs=("biblatex-vancouver",))
    state = {"visible": False}
    calls = []

    def present(b, f):
        return state["visible"]

    def install(b, pkg, job=None, repository=None):
        calls.append((pkg, repository))
        if repository == tinytex.FALLBACK_REPOSITORY:
            state["visible"] = True
        return True

    monkeypatch.setattr(tinytex, "_file_present", present)
    monkeypatch.setattr(tinytex, "_tlmgr_install", install)
    log = "Package biblatex Info: ... file 'vancouver.bbx' not found.\n"
    installed = tinytex.maybe_install_missing(job, log)
    assert installed == ["biblatex-vancouver"]
    assert calls == [("biblatex-vancouver", None),
                     ("biblatex-vancouver", tinytex.FALLBACK_REPOSITORY)]


# --- compile retry cascade ----------------------------------------------------


class FakeProc:
    def __init__(self, lines, rc):
        self.stdout = iter(lines)
        self._rc = rc

    def wait(self):
        return self._rc


class FakeTarget:
    name = "fake"

    def __init__(self, procs):
        self.procs = list(procs)
        self.runs = 0

    def run_latexmk(self, root, main_file, build_dir, force=False):
        self.runs += 1
        return self.procs.pop(0)

    def collect_artifacts(self, root, main_file, build_dir):
        pass


def _run_pump(monkeypatch, tmp_path, procs, installs):
    svc = CompileService(None, JobRegistry())
    target = FakeTarget(procs)
    job = svc.jobs.create("compile", "main.tex")
    calls = []

    def fake_install(job_, txt):
        calls.append(txt)
        return installs[min(len(calls) - 1, len(installs) - 1)] if installs else []

    monkeypatch.setattr(tinytex, "maybe_install_missing", fake_install)
    build_dir = tmp_path / "build"
    build_dir.mkdir(exist_ok=True)
    first = target.run_latexmk(tmp_path, "main.tex", build_dir)
    svc._pump(job, first, tmp_path, "main.tex", build_dir, threading.Event(), target)
    return job, target


def test_cascade_needing_four_attempts_succeeds(monkeypatch, tmp_path):
    # ragged2e -> cyrillic -> babel-russian -> success: 4 latexmk runs, which
    # exceeded the old range(3) cap (issue 47).
    procs = [
        FakeProc(["! LaTeX Error: File `ragged2e.sty' not found.\n"], 1),
        FakeProc(["Package fontenc Error: Encoding file `t2aenc.def' not found.\n"], 1),
        FakeProc(["! Package babel Error: Unknown option 'russian'.\n"], 1),
        FakeProc(["ok\n"], 0),
    ]
    installs = [["ragged2e"], ["cyrillic"], ["babel-russian"]]
    # A successful pdflatex run leaves the PDF behind; "done" requires it.
    build = tmp_path / "build"
    build.mkdir(exist_ok=True)
    (build / "main.pdf").write_bytes(b"%PDF-1.4")
    job, target = _run_pump(monkeypatch, tmp_path, procs, installs)
    assert MAX_COMPILE_ATTEMPTS >= 4
    assert target.runs == 4
    assert job.status == "done"


def test_unfixable_document_stops_after_first_attempt(monkeypatch, tmp_path):
    # Nothing installable in the log: no retry storm, one latexmk run only.
    procs = [FakeProc(["! Undefined control sequence.\n"], 1)]
    job, target = _run_pump(monkeypatch, tmp_path, procs, [])
    assert target.runs == 1
    assert job.status == "error"


def test_failed_install_not_retried_within_same_job(monkeypatch):
    job, _names = _install_env(monkeypatch)
    attempts = []
    def flaky(b, pkg, job=None, repository=None):
        attempts.append(pkg)
        return pkg != "cyrillic"
    monkeypatch.setattr(tinytex, "_tlmgr_install", flaky)
    first = tinytex.maybe_install_missing(job, CASCADE_LOG)
    assert "cyrillic" not in first
    tinytex.maybe_install_missing(job, CASCADE_LOG)
    assert attempts.count("cyrillic") == 1
    assert "skipping t2aenc.def" in job.text()


def test_babel_stub_file_on_disk_does_not_count_as_installed(monkeypatch):
    # Core Babel 3.x ships locale/ru/babel-russian.tex inside its own package,
    # so the file sits on disk even while babel-russian is NOT installed —
    # and `tlmgr remove` leaves that core-owned file behind. Presence must be
    # judged by package state or "Unknown option 'russian'" is unrepairable
    # (issue 47 E2E: the stub loaded, the language stayed unregistered).
    job, names = _install_env(monkeypatch)
    def present(b, fname):
        return fname == "babel-russian.tex"
    monkeypatch.setattr(tinytex, "_file_present", present)
    installed = tinytex.maybe_install_missing(job, "Package babel Error: Unknown option 'russian'.")
    assert installed == ["babel-russian", "hyphen-russian"]
    assert names == installed


def test_stale_pdf_and_error_state_retries_after_fdb_clear(monkeypatch, tmp_path):
    # A stale main.pdf from a killed job plus a latexmk "gave an error in
    # previous invocation" refusal must not short-circuit the retry loop:
    # clear fdb and force a rerun (issue 47 E2E follow-up).
    build = tmp_path / "build"
    build.mkdir()
    (build / "main.pdf").write_bytes(b"%PDF-1.4 stale")
    procs = [
        FakeProc(["Latexmk: All targets are up-to-date\n",
                  "  pdflatex: gave an error in previous invocation of latexmk.\n"], 12),
        FakeProc(["ok\n"], 0),
    ]
    job, target = _run_pump(monkeypatch, tmp_path, procs, [])
    assert target.runs == 2
    assert job.status == "done"


def test_stale_marker_in_older_attempt_does_not_loop(monkeypatch, tmp_path):
    # The refusal marker from an earlier attempt must not keep retriggering
    # the fdb-clear retry on later attempts that fail for another reason.
    procs = [
        FakeProc(["  pdflatex: gave an error in previous invocation of latexmk.\n"], 12),
        FakeProc(["! Undefined control sequence.\n"], 1),
    ]
    job, target = _run_pump(monkeypatch, tmp_path, procs, [])
    assert target.runs == 2
    assert job.status == "error"


def test_up_to_date_exit_12_with_pdf_is_done(monkeypatch, tmp_path):
    # latexmk exits 12 when everything is already up-to-date ("Nothing to
    # do"): with a PDF on disk that is a successful compile, not an error —
    # otherwise the idempotent recompile of a good build ends "error".
    build = tmp_path / "build"
    build.mkdir()
    (build / "main.pdf").write_bytes(b"%PDF-1.4 fresh")
    procs = [FakeProc(["Latexmk: Nothing to do for 'main.tex'.\n",
                       "Latexmk: All targets are up-to-date\n"], 12)]
    job, target = _run_pump(monkeypatch, tmp_path, procs, [])
    assert target.runs == 1
    assert job.status == "done"


def test_font_metric_error_installs_font_package(monkeypatch):
    # fontenc.sty's unquoted "Metric (TFM) file not found" names the .tfm
    # base; tlmgr search resolves it to the font package (lhcyr for T2A CM).
    job, _names = _install_env(monkeypatch)
    monkeypatch.setattr(tinytex, "_pkg_for_file", lambda b, f: "lhcyr")
    log = ("mktextfm: `mf-nowin -progname=mf' failed to make larm1000.tfm.\n"
           "Font T2A/cmr/m/n/10=larm1000 at 10.0pt not loadable: Metric (TFM) file not found.\n")
    installed = tinytex.maybe_install_missing(job, log)
    assert installed == ["lhcyr"]


def test_mf_font_error_installs_source_package(monkeypatch):
    # mktexpk names the font whose Metafont sources are absent (TL2026 split
    # the LH fonts out of lhcyr into package `lh`); resolution goes through
    # the .mf file like any other missing file.
    job, _names = _install_env(monkeypatch)
    monkeypatch.setattr(tinytex, "_pkg_for_file", lambda b, f: "lh")
    log = ("kpathsea: Running mktexpk --mfmode / --bdpi 600 --mag 1+0/600 --dpi 600 larm1000\n"
           "mktexpk: don't know how to create bitmap font for larm1000.\n"
           "!pdfTeX error: pdflatex (file larm1000): Font larm1000 at 600 not found\n")
    installed = tinytex.maybe_install_missing(job, log)
    assert installed == ["lh"]


def test_font_tool_error_installs_converter(monkeypatch):
    # mktexpk names the missing GF->PK converter; it ships as a tlmgr package
    # of the same name (gsftopk), installed after the file-based repairs.
    job, _names = _install_env(monkeypatch)
    monkeypatch.setattr(tinytex, "_pkg_for_file", lambda b, f: "lh")
    log = ("/fake/bin/mktexpk: 160: gsftopk: not found\n"
           "mktexpk: don't know how to create bitmap font for larm1000.\n")
    installed = tinytex.maybe_install_missing(job, log)
    assert installed == ["lh", "gsftopk"]


def test_font_tool_present_is_skipped(monkeypatch, tmp_path):
    job, names = _install_env(monkeypatch)
    b = tmp_path / "bin"
    b.mkdir()
    (b / "gsftopk").write_text("x")
    monkeypatch.setattr(tinytex, "bin_dir", lambda p: b)
    installed = tinytex.maybe_install_missing(job, "/x/mktexpk: 160: gsftopk: not found\n")
    assert installed == []
    assert names == []


def test_pkg_for_file_mf_source_family_fallback(monkeypatch):
    # Mirror file index misses lh (issue 47 E2E on tlnet.yihui.org): search
    # returns nothing, so LH .mf sources resolve by font family — package
    # `lh` first (TL2026), validated against the repository index.
    out = "package:     lh\ninstalled:   No\n"
    fake = FakeRun({"lh": (0, out)})
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "larm1000.mf") == "lh"


def test_pkg_for_file_mf_source_family_falls_back_to_lhcyr(monkeypatch):
    # Pre-TL2026 trees: `lh` unknown to the index, `lhcyr` holds the sources.
    fake = FakeRun({"lh": (0, "tlmgr: Package lh not found.\n"),
                   "lhcyr": (0, "package:     lhcyr\ninstalled:   No\n")})
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "lasx1000.mf") == "lhcyr"


def test_pkg_for_file_mf_source_unknown_family_guesses(monkeypatch):
    # Non-LH family with no index hit: plain basename guess, as before.
    fake = FakeRun()
    monkeypatch.setattr(tinytex, "_run", fake)
    assert tinytex._pkg_for_file(Path("/fake/bin"), "cmr10.mf") == "cmr10"


# --- partial-mirror fallback (CTAN) -------------------------------------------


def test_partial_mirror_triggers_ctan_fallback(monkeypatch):
    # The primary mirror's build of `lh` is partial (X2 sources only, no T2A):
    # the install succeeds but larm1000.mf never appears - retry once from the
    # official CTAN repository, where the file does exist.
    job, _ = _install_env(monkeypatch)
    monkeypatch.setattr(tinytex, "_pkg_for_file", lambda b, f: "lh")
    calls = []

    def install(b, pkg, job=None, repository=None):
        calls.append((pkg, repository))
        return True

    monkeypatch.setattr(tinytex, "_tlmgr_install", install)
    checks = {"n": 0}

    def present(b, f):
        # The file only exists after the second (CTAN) install.
        checks["n"] += 1
        return checks["n"] >= 3

    monkeypatch.setattr(tinytex, "_file_present", present)
    log = "mktexpk: don't know how to create bitmap font for larm1000.\n"
    installed = tinytex.maybe_install_missing(job, log)
    assert calls == [("lh", None), ("lh", tinytex.FALLBACK_REPOSITORY)]
    assert installed == ["lh"]
    assert "retrying from" in job.text()


def test_partial_mirror_fallback_failure_is_not_retried(monkeypatch):
    # The CTAN retry also fails to produce the file: mark the package failed
    # so later attempts in the same run skip it instead of re-installing forever.
    job, _ = _install_env(monkeypatch)
    monkeypatch.setattr(tinytex, "_pkg_for_file", lambda b, f: "lh")
    calls = []

    def install(b, pkg, job=None, repository=None):
        calls.append((pkg, repository))
        return True

    monkeypatch.setattr(tinytex, "_tlmgr_install", install)
    monkeypatch.setattr(tinytex, "_file_present", lambda b, f: False)
    log = "mktexpk: don't know how to create bitmap font for larm1000.\n"
    first = tinytex.maybe_install_missing(job, log)
    assert calls == [("lh", None), ("lh", tinytex.FALLBACK_REPOSITORY)]
    second = tinytex.maybe_install_missing(job, log)
    assert second == []
    assert len(calls) == 2  # no third install attempt
    assert "failed earlier in this run" in job.text()
