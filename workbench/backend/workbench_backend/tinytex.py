"""In-app TinyTeX: a minimal TeX Live living in a hidden folder of the app.

The distribution is downloaded from the official TinyTeX releases
(github.com/rstudio/tinytex-releases), extracted into `<app>/.texlive` and
used, modified and invoked only by this app — no system-wide install, no
admin rights, nothing leaks onto PATH outside our subprocesses.

- `install(job)`        — download + extract (or update an existing copy) and
                          make sure the packages the built-in template needs
                          are present (tlmgr installs anything missing).
- `maybe_install_missing` — called by the compile service after a failed run:
                          parses missing-file lines ("file `x.sty' not
                           found", case-insensitive), babel "Unknown option
                           '<lang>'", missing font metrics (TFM), bitmap fonts
                           whose Metafont sources or GF->PK converter are absent,
                           out of the log;
                          installs the providing package(s) and lets the
                          compile retry. This is how TinyTeX is meant to be
                          maintained: you only ever install what you use.
"""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from .errors import ApiError

# <workbench>/backend/workbench_backend/tinytex.py -> parents[2] == workbench root
APP_ROOT = Path(__file__).resolve().parents[2]

RELEASE_API = "https://api.github.com/repos/rstudio/tinytex-releases/releases/latest"
UA = {"User-Agent": "scientific-harness-workbench"}

# Files the built-in classic template needs (plan appendix A). The second
# element is a hint for system package managers; tlmgr resolution uses
# FILE_TO_PKG / basename / `tlmgr search` instead.
REQUIRED_FILES: list[tuple[str, str]] = [
    ("newpxtext.sty", "texlive-fonts-extra"),
    ("microtype.sty", "texlive-latex-recommended"),
    ("booktabs.sty", "texlive-latex-recommended"),
    ("hyperref.sty", "texlive-latex-base"),
    ("geometry.sty", "texlive-latex-recommended"),
    ("amsmath.sty", "texlive-latex-base"),
]

# .sty/.cls file -> TeX Live (tlmgr) package that provides it. Anything not
# listed resolves via `tlmgr search --file`, then to its own basename.
FILE_TO_PKG = {
    "amssymb.sty": "amsfonts",
    "graphicx.sty": "graphics",
    "times.sty": "psnfss",
    "newpxtext.sty": "newpx",
    "newpxmath.sty": "newpx",
    # Encoding definition files: the basename is not a tlmgr package name, and
    # `tlmgr search` only resolves them when the mirror index covers them -
    # map explicitly (issue 47).
    "t2aenc.def": "cyrillic",
    "t2benc.def": "cyrillic",
    # Babel language modules are per-language packages in current TeX Live;
    # russian.ldf does not resolve via `tlmgr search` on every mirror (issue 47).
    "russian.ldf": "babel-russian",
}

# "File `foo.sty' not found" / "file `t2aenc.def' not found" - both quote
# styles, and fontenc's variant is lowercase ("Encoding file ... not found"),
# so the match must be case-insensitive (issue 47).
MISSING_FILE_RE = re.compile(r"file [`']([^'`]+)[`]?' not found", re.IGNORECASE)

# babel reports a missing language module as an unknown option, not a missing
# file (the .ldf lookup happens inside \InputIfFileExists):
#   ! Package babel Error: Unknown option 'russian'.
BABEL_LANG_RE = re.compile(r"Package babel Error: Unknown option '([^']+)'")

# fontenc.sty reports missing font metrics without quotes, so MISSING_FILE_RE
# never sees them: "Font T2A/cmr/m/n/10=larm1000 at 10.0pt not loadable:
# Metric (TFM) file not found." - the name before " at" is the .tfm base.
FONT_METRIC_RE = re.compile(
    r"=([A-Za-z0-9]+) at [\d.]+pt not loadable: Metric \(TFM\) file not found"
)

# With no Type1 map entry, pdflatex falls back to bitmap fonts and mktexpk
# must build them from Metafont sources - which a fresh tree may lack (TL2026
# split the LH fonts out of lhcyr into package `lh`):
#   kpathsea: Running mktexpk --mfmode / --bdpi 600 ... larm1000
#   mktexpk: don't know how to create bitmap font for larm1000.
MF_FONT_RE = re.compile(
    r"mktexpk: don't know how to create bitmap font for ([A-Za-z0-9]+)\."
)

# The GF->PK converters ship as their own tlmgr packages; mktexpk names the
# missing binary: ".../mktexpk: 160: gsftopk: not found".
FONT_TOOL_RE = re.compile(r"\b(gsftopk|gf2pk|ps2pk): not found")


def texlive_dir() -> Path:
    """Hidden folder inside the app directory holding the distribution."""
    return Path(os.environ.get("WORKBENCH_TEXLIVE_DIR") or (APP_ROOT / ".texlive"))


def _arch() -> str:
    m = platform.machine().lower()
    if m in ("x86_64", "amd64"):
        return "x86_64"
    if m in ("aarch64", "arm64"):
        return "arm64"
    raise ApiError(501, f"unsupported machine architecture for TinyTeX: {m}")


def _bin_arch_dirs(prefix: Path) -> list[Path]:
    b = prefix / "bin"
    if not b.is_dir():
        return []
    return [d for d in sorted(b.iterdir()) if d.is_dir()]


def find_prefix() -> Path | None:
    """Installed TinyTeX prefix (a folder with bin/<arch>/tlmgr), else None.

    Tolerates both extraction layouts: files at the root of `.texlive` or a
    single top-level folder inside it.
    """
    p = texlive_dir()
    candidates = [p] + ([s for s in p.iterdir() if s.is_dir()] if p.is_dir() else [])
    for c in candidates:
        for d in _bin_arch_dirs(c):
            if (d / "tlmgr").exists():
                return c
    return None


def bin_dir(prefix: Path) -> Path | None:
    """The architecture-specific bin dir (pdflatex, tlmgr, kpsewhich…)."""
    for d in _bin_arch_dirs(prefix):
        if (d / "tlmgr").exists():
            return d
    return None


def version_lines(prefix: Path) -> str:
    b = bin_dir(prefix)
    if not b:
        return ""
    try:
        out = subprocess.run([str(b / "tlmgr"), "--version"], capture_output=True, text=True, timeout=30)
        lines = (out.stdout or "").strip().splitlines()
        return " / ".join(l.strip() for l in lines[:2] if l.strip())
    except Exception:
        return ""


# --- tlmgr helpers -----------------------------------------------------------

def _run(cmd: list[str], timeout=120) -> tuple[int | None, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, ((p.stdout or "") + (p.stderr or ""))
    except FileNotFoundError:
        return None, "command not found"
    except (subprocess.TimeoutExpired, OSError) as e:
        return None, f"probe failed: {e}"


def _file_present(b: Path, fname: str) -> bool:
    rc, out = _run([str(b / "kpsewhich"), fname], timeout=30)
    return rc == 0 and bool(out.strip())


def _pkg_installed(b: Path, pkg: str) -> bool:
    """True when `pkg` is installed in this TinyTeX tree.

    `tlmgr info <pkg>` exits 0 whether or not the package is installed (it
    prints the index entry either way); the state lives in the
    "installed: Yes|No" field of that output."""
    rc, out = _run([str(b / "tlmgr"), "info", pkg], timeout=60)
    if rc != 0 or not out:
        return False
    for ln in out.splitlines():
        key, _, val = ln.partition(":")
        if key.strip() == "installed":
            return val.strip().lower() == "yes"
    return False


def _pkg_in_index(b: Path, pkg: str) -> bool:
    """True when the repository index has an entry for `pkg`, installed or not.

    `tlmgr info <pkg>` exits 0 even for unknown packages, so the answer is in
    the output: a real entry starts with "package: <name>"."""
    rc, out = _run([str(b / "tlmgr"), "info", pkg], timeout=60)
    if rc != 0 or not out.strip():
        return False
    first = out.strip().splitlines()[0]
    key, _, val = first.partition(":")
    return key.strip() == "package" and val.strip() == pkg


def _mf_source_candidates(base: str) -> list[str]:
    """tlmgr package candidates for a missing Metafont source, by font family.

    LH fonts (larm/larb/... — T2A/T2B Cyrillic): package `lh` since TL2026,
    `lhcyr` before that."""
    if base.startswith("la"):
        return ["lh", "lhcyr"]
    return []


def _babel_lang_present(b: Path, lang: str) -> bool:
    """True only when the per-language package `babel-<lang>` is installed.

    A file check is unreliable here: core Babel 3.x ships a stub module
    locale/<code>/babel-<lang>.tex for every language inside its own
    package, so the file sits on disk even while the language data is
    missing — and `tlmgr remove` leaves those core-owned files behind.
    The compile then fails with "Unknown option '<lang>'" (issue 47 E2E)."""
    return _pkg_installed(b, "babel-" + lang)


def _pkg_for_file(b: Path, fname: str) -> str | None:
    """tlmgr package providing `fname`: explicit mapping, tlmgr search, then a guess."""
    base = fname.rsplit(".", 1)[0]
    mapped = FILE_TO_PKG.get(fname) or FILE_TO_PKG.get(base + ".sty")
    if mapped:
        return mapped
    rc, out = _run([str(b / "tlmgr"), "search", "--global", "--file", "/" + fname], timeout=60)
    if rc == 0 and out.strip():
        # output is a "<pkg>:" header line followed by indented file paths;
        # skip the "tlmgr: package repository ..." banner (it contains spaces)
        for ln in out.splitlines():
            s = ln.strip()
            if s.endswith(":") and " " not in s[:-1]:
                return s[:-1]
    # Metafont sources: this mirror's file index is partial (lh and beamer
    # are absent from it), so resolve LH bitmap-font sources by font family.
    if fname.endswith(".mf"):
        for cand in _mf_source_candidates(base):
            if _pkg_in_index(b, cand):
                return cand
    # fall back to a guess; tlmgr install will report if it is bogus. Babel
    # language modules are per-language packages (babel-<lang>).
    if fname.endswith(".ldf"):
        return f"babel-{base}"
    return base


# The primary mirror (tlnet.yihui.org) ships partial builds of some packages:
# its `lh` tarball contains only X2 sources and no T2A Metafont sources at all,
# so a T2A Cyrillic document can never be repaired from it. When an install
# "succeeds" but the file still does not exist, retry once from here.
FALLBACK_REPOSITORY = "https://mirror.ctan.org/systems/texlive/tlnet"


def _tlmgr_install(b: Path, pkg: str, job=None, repository: str | None = None) -> bool:
    cmd = [str(b / "tlmgr")]
    if repository:
        # Install from a different repository. If the package is already
        # installed (partially, from the primary mirror), force a full
        # re-extract over it.
        cmd += ["--repository", repository]
        if _pkg_installed(b, pkg):
            cmd.append("--reinstall")
    cmd += ["install", pkg]
    rc, out = _run(cmd, timeout=1800)
    text = (out or "").strip()
    if job is not None and text:
        for ln in text.splitlines():
            job.log("  tlmgr: " + ln.rstrip())
    return rc == 0


# --- installation ------------------------------------------------------------

def _latest_asset_url(variant: str) -> tuple[str, str]:
    req = urllib.request.Request(RELEASE_API, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    want = f"{variant}-linux-{_arch()}-"
    for a in data.get("assets", []):
        name = a.get("name", "")
        if name.startswith(want) and name.endswith(".tar.xz"):
            return a["browser_download_url"], data.get("tag_name", "latest")
    raise ApiError(501, f"no {want}* asset in the latest TinyTeX release")


def _download(url: str, dest: Path, job) -> None:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        last_log = -1
        while True:
            chunk = r.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            mb = done // (1024 * 1024)
            if mb != last_log:
                last_log = mb
                job.log(f"downloaded {mb} MB" + (f" / {total // (1024*1024)} MB" if total else ""))


def _ensure_packages(b: Path, job) -> None:
    """Install any REQUIRED_FILES the fresh distribution is missing."""
    for fname, _hint in REQUIRED_FILES:
        if _file_present(b, fname):
            continue
        pkg = _pkg_for_file(b, fname)
        if not pkg:
            job.log(f"could not resolve a package providing {fname} — skipping")
            continue
        job.log(f"{fname} missing — installing tlmgr package `{pkg}`")
        if not _tlmgr_install(b, pkg, job):
            job.log(f"warning: tlmgr install {pkg} failed (may already be provided)")


def install(job) -> None:
    """Full in-app TinyTeX setup, streamed to `job`. Runs in a worker thread."""
    prefix = texlive_dir()
    existing = find_prefix()
    try:
        if existing is not None:
            b = bin_dir(existing)
            job.log(f"in-app TinyTeX already present at {existing} — updating")
            assert b is not None
            rc, out = _run([str(b / "tlmgr"), "update", "--self"], timeout=600)
            for ln in (out or "").splitlines():
                job.log("  tlmgr: " + ln.rstrip())
            if rc != 0:
                job.log("warning: self-update failed; continuing with the existing version")
        else:
            url, tag = _latest_asset_url("TinyTeX-1")
            job.log(f"TinyTeX {tag} (TinyTeX-1, linux-{_arch()}): downloading from")
            job.log(url)
            tmp = Path(tempfile.mkdtemp(prefix="wb-tex-"))
            try:
                tarball = tmp / "tinytex.tar.xz"
                _download(url, tarball, job)
                job.log(f"extracting into hidden app folder: {prefix}")
                prefix.mkdir(parents=True, exist_ok=True)
                with tarfile.open(tarball, "r:xz") as tf:
                    try:
                        tf.extractall(prefix, filter="data")
                    except TypeError:  # Python < 3.12 has no filter arg
                        tf.extractall(prefix)
            finally:
                import shutil as _sh
                _sh.rmtree(tmp, ignore_errors=True)
            existing = find_prefix()
            if existing is None:
                raise ApiError(500, "extraction finished but no TeX Live bin dir was found")
        b = bin_dir(existing)
        assert b is not None
        job.log(f"TeX home: {existing}")
        job.log(version_lines(existing))
        if not (b / "latexmk").exists():
            job.log("latexmk missing — installing it via tlmgr")
            _tlmgr_install(b, "latexmk", job)
        job.log("checking the packages the built-in template needs…")
        _ensure_packages(b, job)
        still = [f for f, _ in REQUIRED_FILES if not _file_present(b, f)]
        if still:
            job.log("note: still missing (rarely needed): " + ", ".join(still))
        job.log("in-app TinyTeX is ready — compiles will use it automatically")
        job.finish("done", 0)
    except ApiError as e:
        job.log(f"error: {e}")
        job.finish("error", None)
    except Exception as e:  # stream any failure into the job log
        job.log(f"error: {type(e).__name__}: {e}")
        job.finish("error", None)


# --- on-demand maintenance ----------------------------------------------------

def maybe_install_missing(job, log_text: str) -> list[str]:
    """After a failed compile: install the packages for what the log is missing
    (files, babel languages, font metrics, bitmap-font sources, GF->PK
    converters). Returns the package names installed (empty => nothing to do)."""
    prefix = find_prefix()
    if prefix is None:
        return []  # never touch system TeX — only our own copy
    b = bin_dir(prefix)
    if not b:
        return []
    names: list[str] = []
    for m in MISSING_FILE_RE.finditer(log_text or ""):
        f = m.group(1).strip()
        if not f or f.startswith("/"):
            continue
        if any(f.endswith(x) for x in (".tex", ".aux", ".log", ".pdf", ".png", ".jpg")):
            continue  # missing source/aux files are document errors, not packages
        names.append(f)
    # babel reports a missing language module as an unknown option, not a
    # missing file; map it to the .ldf that \usepackage[<lang>]{babel} loads.
    for m in BABEL_LANG_RE.finditer(log_text or ""):
        lang = m.group(1).strip().lower()
        if "=" in lang:  # e.g. main=russian
            lang = lang.split("=", 1)[1].strip()
        if lang and "/" not in lang:
            names.append(lang + ".ldf")
    # Missing font metrics (e.g. T2A Computer Modern from lhcyr on a fresh
    # TinyTeX): the name is unquoted, so it needs its own pattern.
    for m in FONT_METRIC_RE.finditer(log_text or ""):
        names.append(m.group(1) + ".tfm")
    # Bitmap fonts whose Metafont sources are absent (TL2026 split the LH
    # fonts out of lhcyr into package `lh`): mktexpk names the font it cannot
    # build; resolve its .mf source like any other missing file.
    for m in MF_FONT_RE.finditer(log_text or ""):
        names.append(m.group(1) + ".mf")
    installed: list[str] = []
    seen: set[str] = set()
    failed = getattr(job, "_tinytex_failed", None)
    if failed is None:
        failed = set()
        job._tinytex_failed = failed
    for f in dict.fromkeys(names):  # dedupe, keep order
        if len(installed) >= 6:
            break
        if f.endswith(".ldf"):
            if _babel_lang_present(b, f[: -len(".ldf")]):
                continue
        elif _file_present(b, f):
            continue
        pkg = _pkg_for_file(b, f)
        if not pkg or pkg in seen:
            continue
        seen.add(pkg)
        if pkg in failed:
            job.log("skipping " + f + " - tlmgr install of `" + pkg + "` failed earlier in this run")
            continue
        job.log(f"missing {f} — installing tlmgr package `{pkg}` (in-app TinyTeX)")
        if _tlmgr_install(b, pkg, job):
            installed.append(pkg)
            if f.endswith(".ldf"):
                # Hyphenation patterns for the language (best effort; they
                # take effect once the pdflatex format is next regenerated).
                hyp = "hyphen-" + f[: -len(".ldf")]
                if hyp not in seen:
                    seen.add(hyp)
                    if _tlmgr_install(b, hyp, job):
                        installed.append(hyp)
            elif not _file_present(b, f):
                # The install "succeeded" but the file still does not exist:
                # the primary mirror's build of this package is partial (e.g.
                # tlnet.yihui.org's `lh` ships only X2 sources - no T2A).
                # Retry once from the official CTAN repository.
                job.log(f"{f} still missing after installing `{pkg}` - retrying from {FALLBACK_REPOSITORY}")
                if not (_tlmgr_install(b, pkg, job, repository=FALLBACK_REPOSITORY) and _file_present(b, f)):
                    failed.add(pkg)
        else:
            failed.add(pkg)
    # Missing GF->PK converters named by mktexpk; each ships as a tlmgr
    # package of the same name (gsftopk). Presence is the binary in bin/.
    for m in FONT_TOOL_RE.finditer(log_text or ""):
        tool = m.group(1)
        if len(installed) >= 6:
            break
        if (b / tool).exists() or tool in seen or tool in failed:
            continue
        seen.add(tool)
        job.log(f"missing font tool `{tool}` — installing tlmgr package `{tool}` (in-app TinyTeX)")
        if _tlmgr_install(b, tool, job):
            installed.append(tool)
        else:
            failed.add(tool)
    return installed
