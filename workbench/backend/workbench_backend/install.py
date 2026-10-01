"""TeX installation: detection and one-click installers (plan section 5 + M3).

For every reachable target this module reports whether TeX is present, which
of the packages the built-in classic template needs are missing, and shows
the exact install command. `start_install` runs that command as a streamed
job so the GUI can show progress (the same job-log mechanism compiles use).

Install scripts per environment:
- WSL distro (Windows host): apt-get as root via `wsl.exe -u root` — no
  password prompt, fully unattended from the GUI.
- Linux host: sudo apt-get (sudo may ask for a password).
- Windows host: winget install MiKTeX.MiKTeX.
- macOS host: brew install --cask mactex-no-gui.
"""

from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import threading
from dataclasses import dataclass, field
from pathlib import Path

from . import state, tinytex
from .errors import ApiError
from .jobs import JobRegistry
from .targets import host_os, list_wsl_distros, wsl_distro_from_root

# Files the built-in classic template needs — single source of truth lives in
# tinytex.py (shared with the in-app installer and the on-demand repair).
REQUIRED_FILES = tinytex.REQUIRED_FILES

APT_PACKAGES = [
    "texlive-latex-base",
    "texlive-latex-recommended",
    "texlive-latex-extra",
    "texlive-fonts-recommended",
    "texlive-fonts-extra",
    "latexmk",
]

APT_SCRIPT = (
    "export DEBIAN_FRONTEND=noninteractive; apt-get update -y && "
    "apt-get install -y " + " ".join(APT_PACKAGES) + " && echo WORKBENCH_APT_DONE"
)


@dataclass
class TargetStatus:
    name: str
    available: bool
    detail: str = ""
    tex_found: bool = False
    version: str = ""
    missing: list[dict] = field(default_factory=list)  # [{file, package}]
    can_install: bool = False
    install_hint: str = ""
    install_command: str = ""
    distros: list[str] = field(default_factory=list)
    recommended: bool = False


def _run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except FileNotFoundError:
        return None, ""
    except (subprocess.TimeoutExpired, OSError):
        return None, "timeout"


def local_install_spec():
    """(cmd_list, hint) for installing TeX on the host OS, or None."""
    os_name = host_os()
    if os_name == "windows":
        if shutil.which("winget"):
            cmd = [
                "winget", "install", "--id", "MiKTeX.MiKTeX", "-e",
                "--accept-source-agreements", "--accept-package-agreements",
            ]
            hint = (
                "Installs MiKTeX via winget. If winget is unavailable, download the installer "
                "from https://miktex.org/download and run it. Restart the app after installing "
                "so PATH changes take effect."
            )
            return cmd, hint
        return None
    if os_name == "linux":
        is_root = hasattr(os, "geteuid") and os.geteuid() == 0
        cmd = ["bash", "-lc", APT_SCRIPT] if is_root else ["sudo", "bash", "-lc", APT_SCRIPT]
        hint = (
            "Installs the targeted TeX Live set (base + recommended + extra + fonts) and "
            "latexmk via apt. Needs root; sudo may ask for a password."
        )
        return cmd, hint
    if os_name == "macos":
        if shutil.which("brew"):
            cmd = ["brew", "install", "--cask", "mactex-no-gui"]
            hint = (
                "Installs MacTeX (no GUI apps) via Homebrew. Alternative: download the MacTeX "
                ".pkg from https://tug.org/mactex/."
            )
            return cmd, hint
        return None
    return None


def _template_extra_files(st) -> list[tuple[str, str]]:
    """Per-template tex_packages for the open project (issue 43).

    Extends the single-source-of-truth REQUIRED_FILES list with packages the
    current project's template declares. Returns (file, tlmgr-package) pairs
    not already covered by REQUIRED_FILES; [] when nothing is open or known.
    """
    if st is None:
        return []
    cur_root = st.get("current_project")
    if not cur_root:
        return []
    try:
        from . import projects as _projects
        cfg = state.load_project_config(Path(cur_root))
        tpl_id = cfg.get("template")
        if not tpl_id:
            return []
        m = _projects.template_manifest(tpl_id)
    except (OSError, ApiError):
        return []
    covered = {f for f, _ in REQUIRED_FILES}
    extra = []
    for pkg in m.get("tex_packages") or []:
        fname = f"{pkg}.sty"
        if fname not in covered:
            covered.add(fname)
            extra.append((fname, tinytex.FILE_TO_PKG.get(fname, pkg)))
    return extra


def probe_tinytex(st=None) -> TargetStatus:
    """The in-app TinyTeX: a hidden TeX Live inside the app folder."""
    stt = TargetStatus(name="tinytex", available=True, recommended=True)
    prefix = tinytex.find_prefix()
    if prefix is None:
        stt.detail = (
            f"not installed yet. Installs into {tinytex.texlive_dir()} — a hidden folder "
            "inside the app directory, used and modified only by this app."
        )
        stt.can_install = True
        stt.install_hint = (
            "Downloads the official TinyTeX-1 release (~50 MB) and extracts it into the "
            "app's hidden .texlive folder. No admin rights needed; packages missing from "
            "your documents are added automatically as you compile."
        )
        stt.install_command = f"(runs inside the app → {tinytex.texlive_dir()})"
        return stt
    b = tinytex.bin_dir(prefix)
    if b is None or not (b / "latexmk").exists():
        stt.detail = f"found at {prefix} but incomplete — reinstall to repair"
        stt.can_install = True
        stt.install_hint = "Re-runs the installer: updates the existing copy and repairs missing parts."
        stt.install_command = f"(runs inside the app → {prefix})"
        return stt
    stt.tex_found = True
    stt.version = tinytex.version_lines(prefix)
    if (b / "kpsewhich").exists():
        for fname, pkg in REQUIRED_FILES + _template_extra_files(st):
            rc, out = _run([str(b / "kpsewhich"), fname], timeout=15)
            if rc != 0 or not out.strip():
                stt.missing.append({"file": fname, "package": pkg})
    extra = f"; missing {len(stt.missing)} required file(s)" if stt.missing else ""
    stt.detail = f"installed in {prefix}{extra}"
    stt.can_install = True
    stt.install_hint = "Updates the in-app copy (tlmgr update) and re-checks the template packages."
    stt.install_command = f"(runs inside the app → {prefix})"
    return stt


def probe_system(st=None) -> TargetStatus:
    """System-wide TeX on PATH only — the in-app TinyTeX is probed separately."""
    stt = TargetStatus(name="system", available=True)
    if shutil.which("latexmk"):
        rc, out = _run(["latexmk", "--version"], timeout=20)
        stt.tex_found = True
        stt.version = out.splitlines()[0] if out else "unknown"
        stt.detail = stt.version
    else:
        stt.detail = "no system TeX installation found on this host (PATH)"
    if stt.tex_found and shutil.which("kpsewhich"):
        for fname, pkg in REQUIRED_FILES + _template_extra_files(st):
            rc, out = _run(["kpsewhich", fname], timeout=15)
            if rc != 0 or not out.strip():
                stt.missing.append({"file": fname, "package": pkg})
    spec = local_install_spec()
    if spec:
        cmd, hint = spec
        stt.can_install = True
        stt.install_hint = hint
        stt.install_command = " ".join(shlex.quote(c) for c in cmd)
    else:
        stt.detail += " (no supported installer found on this OS)"
    return stt


def _wsl_distro_for(st) -> str | None:
    """Configured distro, else one derived from the current project root, else default."""
    d = st.get("wsl_distro")
    if d:
        return d
    cur_root = st.get("current_project")
    if cur_root:
        dd, _ = wsl_distro_from_root(cur_root)
        if dd:
            return dd
    distros = list_wsl_distros()
    return distros[0] if distros else None


def probe_wsl(st) -> TargetStatus:
    stt = TargetStatus(name="wsl", available=True, distros=list_wsl_distros())
    if host_os() != "windows":
        stt.available = False
        stt.detail = "wsl target requires a Windows host"
        return stt
    distro = _wsl_distro_for(st)
    if not distro:
        stt.available = False
        stt.detail = "no WSL distro found (run `wsl --install`)"
        return stt
    base = ["wsl.exe", "-d", distro]
    files = " ".join(f for f, _ in REQUIRED_FILES + _template_extra_files(st))
    script = (
        "for f in " + files + "; do p=$(kpsewhich \"$f\" 2>/dev/null); "
        "if [ -n \"$p\" ]; then echo \"OK $f\"; else echo \"MISSING $f\"; fi; done; "
        "if command -v latexmk >/dev/null 2>&1; then echo HAVE_LATEXMK; "
        "echo \"VER $(latexmk --version | head -n1)\"; else echo NO_LATEXMK; fi"
    )
    rc, out = _run(base + ["bash", "-lc", script], timeout=120)
    if rc is None:
        stt.available = False
        stt.detail = f"WSL distro {distro} did not respond ({out or 'timeout'})"
        return stt
    lines = (out or "").splitlines()
    pkg_of = dict(REQUIRED_FILES + _template_extra_files(st))
    for ln in lines:
        if ln.startswith("MISSING "):
            fname = ln.split(" ", 1)[1]
            stt.missing.append({"file": fname, "package": pkg_of.get(fname, "")})
    if "HAVE_LATEXMK" in lines:
        stt.tex_found = True
        ver = next((l[4:] for l in lines if l.startswith("VER ")), "unknown")
        stt.version = ver.strip()
        extra = f"; missing {len(stt.missing)} required file(s)" if stt.missing else ""
        stt.detail = f"TeX found in WSL distro {distro}{extra}"
    else:
        stt.detail = f"no TeX in WSL distro {distro}"
    cmd = ["wsl.exe", "-u", "root", "-d", distro, "bash", "-lc", APT_SCRIPT]
    stt.can_install = True
    stt.install_hint = (
        f"Runs apt-get as root inside WSL distro {distro} — no password prompt, fully "
        "unattended from the GUI. Installs: " + ", ".join(APT_PACKAGES) + "."
    )
    stt.install_command = " ".join(shlex.quote(c) for c in cmd)
    return stt


def probe_ssh(st) -> TargetStatus:
    """Remote ssh target (M4): per-project config; probes reachability + remote TeX."""
    stt = TargetStatus(name="ssh", available=True)
    cur_root = st.get("current_project")
    if not cur_root:
        stt.available = False
        stt.detail = "no project open — ssh settings are per project"
        return stt
    from .targets import SshTarget
    cfg = state.load_project_config(Path(cur_root)).get("ssh") or {}
    if not (cfg.get("host") and cfg.get("user")):
        stt.available = False
        stt.detail = "not configured — pick Target → SSH… in the top bar"
        return stt
    r = SshTarget(cfg, Path(cur_root)).check()
    where = f"{cfg['user']}@{cfg['host']}"
    if r.ok:
        stt.tex_found = True
        stt.version = r.detail
        stt.detail = f"TeX found on {where} — {r.detail}"
    else:
        stt.detail = f"{where}: {r.detail}"
    stt.install_hint = (
        "The remote machine needs TeX Live + latexmk, e.g. "
        "`sudo apt-get install texlive-latex-base texlive-latex-recommended "
        "texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra latexmk` "
        "(or a tlmgr install). The app cannot install on the remote for you — "
        "set it up there, then re-probe."
    )
    return stt


def status(st) -> list[dict]:
    out = [probe_tinytex(st), probe_system(st)]
    if host_os() == "windows":
        out.append(probe_wsl(st))
    out.append(probe_ssh(st))
    return out


def start_install(st, jobs: JobRegistry, target: str, distro: str | None = None) -> str:
    if target in ("tinytex", "in-app TinyTeX"):
        job = jobs.create("install", "install in-app TinyTeX")
        threading.Thread(target=tinytex.install, args=(job,), daemon=True).start()
        return job.id
    if target == "wsl":
        d = distro or _wsl_distro_for(st)
        if not d:
            raise ApiError(400, "no WSL distro available")
        cmd = ["wsl.exe", "-u", "root", "-d", d, "bash", "-lc", APT_SCRIPT]
        label = f"install TeX in WSL {d}"
    elif target in ("system", "local"):  # "local" kept as an install alias
        spec = local_install_spec()
        if not spec:
            raise ApiError(501, "no supported installer found on this OS")
        cmd, _hint = spec
        label = "install TeX (system)"
    else:
        raise ApiError(400, f"unknown install target: {target}")
    job = jobs.create("install", label)
    threading.Thread(target=_pump_install, args=(job, cmd), daemon=True).start()
    return job.id


def _pump_install(job, cmd) -> None:
    job.log("$ " + " ".join(shlex.quote(c) for c in cmd))
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
    except (FileNotFoundError, OSError) as e:
        job.finish("error", None)
        job.log(f"failed to start installer: {e}")
        return
    assert proc.stdout is not None
    for line in proc.stdout:
        job.log(line)
    rc = proc.wait()
    job.finish("done" if rc == 0 else "error", rc)