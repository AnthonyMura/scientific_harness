"""In-app TinyTeX: a minimal TeX Live living in a hidden folder of the app.

The distribution is downloaded from the official TinyTeX releases
(github.com/rstudio/tinytex-releases), extracted into `<app>/.texlive` and
used, modified and invoked only by this app — no system-wide install, no
admin rights, nothing leaks onto PATH outside our subprocesses.

- `install(job)`        — download + extract (or update an existing copy) and
                          make sure the packages the built-in template needs
                          are present (tlmgr installs anything missing).
- `maybe_install_missing` — called by the compile service after a failed run:
                          parses "File 'x.sty' not found" out of the log,
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
# listed resolves to its own basename, then to `tlmgr search --file`.
FILE_TO_PKG = {
    "amssymb.sty": "amsfonts",
    "graphicx.sty": "graphics",
    "times.sty": "psnfss",
    "newpxtext.sty": "newpx",
    "newpxmath.sty": "newpx",
}

MISSING_FILE_RE = re.compile(r"File [`']([^'`]+)[`]?' not found")


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


def _pkg_for_file(b: Path, fname: str) -> str | None:
    """tlmgr package providing `fname`: mapping, basename, then tlmgr search."""
    base = fname.rsplit(".", 1)[0]
    guesses = [FILE_TO_PKG.get(fname), FILE_TO_PKG.get(base + ".sty"), base]
    for g in guesses:
        if not g:
            continue
        rc, out = _run([str(b / "tlmgr"), "search", "--global", "--file", "/" + fname], timeout=60)
        if rc == 0 and out.strip():
            # output: "<pkg>:" lines followed by indented file paths
            for ln in out.splitlines():
                s = ln.strip()
                if not s:
                    continue
                if s.endswith(":"):
                    return s[:-1]
                break  # first hit line without a package header — unknown
        if rc == 0 and g in (out or ""):
            return g
    # fall back to the direct guess; tlmgr install will report if it is bogus
    return FILE_TO_PKG.get(fname) or base


def _tlmgr_install(b: Path, pkg: str, job=None) -> bool:
    rc, out = _run([str(b / "tlmgr"), "install", pkg], timeout=600)
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
    """After a failed compile: install packages for missing files found in the
    log. Returns the package names installed (empty => nothing to do)."""
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
    installed: list[str] = []
    seen: set[str] = set()
    for f in dict.fromkeys(names):  # dedupe, keep order
        if len(installed) >= 6:
            break
        if _file_present(b, f):
            continue
        pkg = _pkg_for_file(b, f)
        if not pkg or pkg in seen:
            continue
        seen.add(pkg)
        job.log(f"missing {f} — installing tlmgr package `{pkg}` (in-app TinyTeX)")
        if _tlmgr_install(b, pkg, job):
            installed.append(pkg)
    return installed
