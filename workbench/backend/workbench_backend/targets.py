"""Compile targets: where and how TeX runs (plan section 5).

One interface, multiple implementations. v0 ships `local` and `wsl`; the ssh
target arrives in M4 behind the same interface.
"""

from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from . import tinytex
from .errors import ApiError

# \\wsl.localhost\Ubuntu\home\... (also tolerate /wsl/bash/...)
UNC_WSL_RE = re.compile(r"^[/\\]+wsl\.(?:localhost|bash)[/\\](?P<distro>[^/\\]+)[/\\]?(?P<path>.*)$")

LATEXMK_ARGS = ["-pdf", "-synctex=1", "-interaction=nonstopmode", "-file-line-error"]


@dataclass
class TargetResult:
    ok: bool
    detail: str = ""


def host_os() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def wsl_distro_from_root(root) -> tuple[str | None, str | None]:
    """If `root` is a UNC path into a WSL distro, return (distro, linux_path)."""
    s = str(root).replace("\\", "/")
    m = UNC_WSL_RE.match(s)
    if not m:
        return None, None
    return m.group("distro"), "/" + (m.group("path").strip("/") or "")


def list_wsl_distros() -> list[str]:
    if host_os() != "windows":
        return []
    try:
        out = subprocess.run(["wsl.exe", "-l", "-q"], capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return []
    return [x.strip() for x in (out.stdout or "").splitlines() if x.strip()]


def default_wsl_distro() -> str | None:
    distros = list_wsl_distros()
    return distros[0] if distros else None


def wsl_path_for(root, distro: str | None) -> tuple[str | None, str]:
    """Map a project root to (distro, linux_path) for the wsl target.

    UNC paths into a distro win; plain Windows paths map to /mnt/<drive>;
    anything else is assumed to already be a native Linux path (backend
    running inside WSL).
    """
    d, lp = wsl_distro_from_root(root)
    if d and lp:
        return d, lp
    s = str(root).replace("\\", "/")
    m = re.match(r"^/([A-Za-z])/(.*)$", s)
    if m and host_os() == "windows":
        return distro or default_wsl_distro(), f"/mnt/{m.group(1).lower()}/" + m.group(2)
    return distro or default_wsl_distro(), str(root)


class CompileTarget:
    """Interface every compile target implements (plan section 5)."""

    name = "base"

    def check(self) -> TargetResult:
        raise NotImplementedError

    def run_latexmk(
        self, root: Path, main_file: str, build_dir: Path, force: bool = False
    ) -> subprocess.Popen:
        raise NotImplementedError


class LocalTarget(CompileTarget):
    """TeX on the same OS as the backend: the in-app TinyTeX first (a hidden
    TeX Live inside the app folder, used and modified only by this app), then
    a system-wide installation (MiKTeX/TeX Live, MacTeX, texlive)."""

    name = "local"

    def _tinytex(self) -> tuple[Path | None, dict | None]:
        """(bin_dir, env with PATH injection) for the in-app TinyTeX."""
        prefix = tinytex.find_prefix()
        if not prefix:
            return None, None
        b = tinytex.bin_dir(prefix)
        if not b or not (b / "latexmk").exists():
            return None, None
        env = dict(os.environ)
        env["PATH"] = str(b) + os.pathsep + env.get("PATH", "")
        return b, env

    def check(self) -> TargetResult:
        b, env = self._tinytex()
        if b is not None:
            try:
                out = subprocess.run(
                    [str(b / "latexmk"), "--version"], capture_output=True, text=True, timeout=20, env=env
                )
                first = (out.stdout or "").strip().splitlines()
                return TargetResult(True, "in-app TinyTeX — " + (first[0] if first else ""))
            except Exception as e:  # report any probe failure to the UI
                return TargetResult(False, f"in-app TinyTeX failed to run: {e}")
        if not shutil.which("latexmk"):
            return TargetResult(False, "no system TeX on PATH and no in-app TinyTeX (use the Install panel)")
        try:
            out = subprocess.run(["latexmk", "--version"], capture_output=True, text=True, timeout=20)
        except Exception as e:  # report any probe failure to the UI
            return TargetResult(False, f"latexmk failed to run: {e}")
        first = (out.stdout or "").strip().splitlines()
        return TargetResult(True, "system TeX — " + (first[0] if first else "latexmk found"))

    def run_latexmk(
        self, root: Path, main_file: str, build_dir: Path, force: bool = False
    ) -> subprocess.Popen:
        b, env = self._tinytex()
        args = (["-f"] if force else []) + LATEXMK_ARGS
        cmd = [str(b / "latexmk") if b else "latexmk", *args, f"-output-directory={build_dir}", main_file]
        return subprocess.Popen(
            cmd, cwd=str(root), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env
        )


class WslTarget(CompileTarget):
    """TeX inside a WSL2 distro (Windows hosts only)."""

    name = "wsl"

    def __init__(self, distro: str | None = None) -> None:
        self.distro = distro or default_wsl_distro()

    def _app_tex_prefix(self) -> str:
        """The app's .texlive folder as seen from inside the distro ('' if none)."""
        d, lp = wsl_path_for(tinytex.APP_ROOT, self.distro)
        if not lp:
            return ""
        return f"{lp}/.texlive"

    def _path_snippet(self) -> str:
        prefix = self._app_tex_prefix()
        if not prefix:
            return ""
        return (
            f"for d in {shlex.quote(prefix)}/bin/*/; do "
            'if [ -x "${d}latexmk" ]; then export PATH="${d}${PATH}"; break; fi; done; '
        )

    def check(self) -> TargetResult:
        if host_os() != "windows":
            return TargetResult(False, "wsl target requires a Windows host")
        base = ["wsl.exe", "-d", self.distro] if self.distro else ["wsl.exe"]
        probe = (
            self._path_snippet()
            + "command -v latexmk >/dev/null 2>&1 && latexmk --version"
            " || echo WORKBENCH_NO_LATEXMK"
        )
        try:
            out = subprocess.run(
                base + ["bash", "-lc", probe], capture_output=True, text=True, timeout=90
            )
        except FileNotFoundError:
            return TargetResult(False, "wsl.exe not found")
        except (subprocess.TimeoutExpired, OSError):
            return TargetResult(
                False, f"WSL distro {self.distro or '(default)'} did not respond in time"
            )
        text = (out.stdout or "").strip()
        if "WORKBENCH_NO_LATEXMK" in text or not text:
            return TargetResult(False, f"latexmk not installed in WSL distro {self.distro or '(default)'}")
        return TargetResult(True, text.splitlines()[0].strip())

    def run_latexmk(
        self, root: Path, main_file: str, build_dir: Path, force: bool = False
    ) -> subprocess.Popen:
        if host_os() != "windows":
            raise ApiError(501, "wsl target requires a Windows host")
        d, linux_root = wsl_path_for(root, self.distro)
        base = ["wsl.exe", "-d", d] if d else ["wsl.exe"]
        rel_build = str(build_dir.relative_to(root)).replace("\\", "/")
        args = (["-f"] if force else []) + LATEXMK_ARGS
        script = (
            self._path_snippet()
            + f"cd {shlex.quote(linux_root)} && exec latexmk "
            + " ".join(args)
            + f" -output-directory={shlex.quote(rel_build)} {shlex.quote(main_file)}"
        )
        return subprocess.Popen(
            base + ["bash", "-lc", script],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )


def get_target(name: str, root: Path) -> CompileTarget:
    """Resolve a target name (or 'auto') to an implementation."""
    if name == "local":
        return LocalTarget()
    if name == "wsl":
        d, _ = wsl_distro_from_root(root)
        return WslTarget(d)
    if name == "auto":
        local = LocalTarget()
        r = local.check()
        if r.ok:
            return local
        if host_os() == "windows":
            wsl = WslTarget()
            if wsl.check().ok:
                return wsl
        raise ApiError(
            501,
            f"no TeX installation found ({r.detail}) — open the Install panel and install "
            "the in-app TinyTeX (recommended, no admin rights) or a system TeX",
        )
    raise ApiError(400, f"unknown compile target: {name}")