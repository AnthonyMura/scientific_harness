"""System-git service for the Git module (issue 42) and project scaffolding (43).

The sidecar shells out to the system `git` binary; there is no git engine in
the browser. Issue 43 needs only repo detection, init + baseline commit and
commit-all; issue 42 owns the rest: working-tree status, history, commit
diffs, staging, branches and checkout.

Graceful degradation is a hard requirement: on machines without git (or
without commits yet) every read returns an empty shape instead of raising, so
the Git module can show its install/empty states. Mutations raise ApiError
with git's own stderr so the UI can surface what went wrong.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .errors import ApiError


def git_available() -> bool:
    return shutil.which("git") is not None


def _git(root: Path, *args: str, timeout: int = 30) -> tuple[int | None, str]:
    """Run git in `root`; returns (returncode, combined output). rc None = git missing."""
    try:
        p = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True, text=True, timeout=timeout,
        )
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except FileNotFoundError:
        return None, ""
    except (subprocess.TimeoutExpired, OSError):
        return None, "git timed out"


def _identity_args(root: Path) -> list[str]:
    """-c user.name/-c user.email fallbacks when no identity is configured.

    Lab machines often have git but no identity; commits must not fail there.
    """
    rc, out = _git(root, "config", "user.email")
    if rc == 0 and out.strip():
        return []
    return ["-c", "user.name=Workbench", "-c", "user.email=workbench@localhost"]


def repo_status(root: Path) -> dict:
    """{repo, initialized}: is root inside a git work tree, does it have >= 1 commit?"""
    rc, out = _git(root, "rev-parse", "--is-inside-work-tree")
    if rc != 0 or "true" not in out:
        return {"repo": False, "initialized": False}
    rc2, _ = _git(root, "rev-parse", "-q", "HEAD")
    return {"repo": True, "initialized": rc2 == 0}


def init_and_commit(root: Path, message: str) -> dict:
    """git init + add -A + baseline commit. Never raises; reports what happened."""
    if not git_available():
        return {
            "repo": False, "initialized": False, "committed": False,
            "detail": "git binary not found — project created without a repository",
        }
    rc, out = _git(root, "init", "-b", "main")
    if rc != 0:
        # Older git without `init -b`: plain init (default branch name kept).
        rc, out = _git(root, "init")
        if rc != 0:
            return {
                "repo": False, "initialized": False, "committed": False,
                "detail": out or "git init failed",
            }
    _git(root, "add", "-A")
    rc, out = _git(root, *(_identity_args(root)), "commit", "-m", message)
    if rc == 0:
        return {"repo": True, "initialized": True, "committed": True, "detail": ""}
    # Empty tree (e.g. everything ignored by .gitignore): the repo exists but
    # has no commit yet — initialized stays False so the UI can offer a commit.
    return {
        "repo": True, "initialized": False, "committed": False,
        "detail": out or "git commit failed",
    }


def commit(root: Path, message: str, all: bool = False) -> dict:
    """Commit the staged set (or everything when all=True). Raises ApiError on failure."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")
    if all:
        rc, out = _git(root, "add", "-A")
        if rc != 0:
            raise ApiError(500, out or "git add failed")
    else:
        # Distinguish "nothing staged" from "staged but no diff" for the UI message.
        rc, _ = _git(root, "diff", "--cached", "--quiet")
        if rc == 0:
            raise ApiError(409, "no staged changes — stage files first or include all changes")
    rc, out = _git(root, *(_identity_args(root)), "commit", "-m", message)
    if rc == 0:
        return {"ok": True}
    if "nothing to commit" in out or "no changes added" in out:
        raise ApiError(409, "nothing to commit")
    raise ApiError(500, out or "git commit failed")


def commit_all(root: Path, message: str) -> None:
    """Legacy issue-43 entry point: stage everything and commit."""
    commit(root, message, all=True)


# --- issue 42: working tree ---------------------------------------------------

def _unquote_c(s: str) -> str:
    """Unquote a C-style quoted path from porcelain v2 (spaces, unicode, …)."""
    if len(s) < 2 or not (s.startswith('"') and s.endswith('"')):
        return s
    body = s[1:-1]
    simple = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "a": "\a", "b": "\b",
              "f": "\f", "r": "\r", "v": "\v"}
    out: list[str] = []
    i = 0
    while i < len(body):
        c = body[i]
        if c == "\\" and i + 1 < len(body):
            n = body[i + 1]
            if n in simple:
                out.append(simple[n])
                i += 2
                continue
            if n.isdigit():  # \ooo octal escape, up to three digits
                j = i + 1
                while j < len(body) and body[j].isdigit() and j - i < 4:
                    j += 1
                out.append(chr(int(body[i + 1:j], 8)))
                i = j
                continue
        out.append(c)
        i += 1
    return "".join(out)


def workbench_status(root: Path) -> dict:
    """Full working-tree state for the Git module.

    Parses `git status --porcelain=v2 --branch`: staged/unstaged entries with
    status badges (M/A/D/R/C/U; untracked shown as A), branch + detached flag,
    upstream and ahead/behind counts, plus remotes from `git remote -v`.
    """
    base = {
        "git": git_available(), "repo": False, "initialized": False,
        "branch": None, "detached": False, "upstream": None,
        "ahead": 0, "behind": 0, "staged": [], "changes": [], "remotes": [],
    }
    if not git_available():
        return base
    rc, out = _git(root, "rev-parse", "--is-inside-work-tree")
    if rc != 0 or "true" not in out:
        return base
    base["repo"] = True
    base["initialized"] = _git(root, "rev-parse", "-q", "HEAD")[0] == 0

    staged: list[dict] = []
    changes: list[dict] = []
    rc, out = _git(root, "status", "--porcelain=v2", "--branch")
    if rc == 0:
        for line in out.splitlines():
            if not line:
                continue
            if line.startswith("# branch.head "):
                head = line[len("# branch.head "):].strip()
                if head == "(detached)":
                    base["detached"] = True
                else:
                    base["branch"] = head
            elif line.startswith("# branch.upstream "):
                base["upstream"] = line[len("# branch.upstream "):].strip()
            elif line.startswith("# branch.ab "):
                parts = line.split()  # ['#', 'branch.ab', '+N', '-M']
                if len(parts) >= 4:
                    base["ahead"] = int(parts[2].lstrip("+"))
                    base["behind"] = int(parts[3].lstrip("-"))
            elif line.startswith("1 "):
                # 1 XY <sub> <mH> <mI> <mode...> <hashes> <path> — XY is token 2,
                # the path is always the last token (quoted if it has spaces).
                tokens = line.split(" ")
                if len(tokens) < 3:
                    continue
                x, y = tokens[1][0], tokens[1][1]
                path = _unquote_c(tokens[-1])
                if x not in (" ", "?"):
                    staged.append({"path": path, "badge": x})
                if y != " ":
                    changes.append({"path": path, "badge": y})
            elif line.startswith("2 "):
                # 2 XY <sub> ... <mode> <object> <new>\t<old> (tab-separated paths);
                # the new path is the last token before the tab.
                rest = line[2:]
                head_part, _, _old = rest.partition("\t")
                xy_tokens = head_part.split(" ")
                if len(xy_tokens) < 3:
                    continue
                x, y = xy_tokens[0][0], xy_tokens[0][1]
                path = _unquote_c(xy_tokens[-1])
                if x not in (" ", "?"):
                    staged.append({"path": path, "badge": x})
                if y != " ":
                    changes.append({"path": path, "badge": y})
            elif line.startswith("? "):
                # Untracked: VS Code shows it under Changes; spec badge is A.
                changes.append({"path": _unquote_c(line[2:]), "badge": "A"})
    base["staged"], base["changes"] = staged, changes

    rc, out = _git(root, "remote", "-v")
    if rc == 0:
        remotes: dict[str, str] = {}
        for line in out.splitlines():
            parts = line.split(" ", 2)
            if len(parts) >= 3 and parts[1] == "(fetch)":
                remotes.setdefault(parts[0], parts[2])
        base["remotes"] = [{"name": n, "url": u} for n, u in remotes.items()]
    return base


def stage(root: Path, paths: list[str]) -> None:
    """Stage the given paths (additions, modifications and deletions)."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")
    rc, out = _git(root, "add", "-A", "--", *paths)
    if rc != 0:
        raise ApiError(500, out or "git add failed")


def unstage(root: Path, paths: list[str]) -> None:
    """Unstage the given paths (needs at least one commit to reset against)."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    st = repo_status(root)
    if not st["repo"]:
        raise ApiError(409, "not a git repository")
    if not st["initialized"]:
        raise ApiError(409, "no commits yet — nothing to unstage against")
    rc, out = _git(root, "reset", "-q", "--", *paths)
    if rc != 0:
        raise ApiError(500, out or "git reset failed")


def discard(root: Path, paths: list[str]) -> None:
    """Discard changes for the given paths (VS Code semantics, destructive).

    Untracked → deleted from disk; staged additions not in HEAD → `git rm -f`;
    staged deletions → restored from HEAD; everything else → `git checkout --`.
    """
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")

    # One status query for all paths: path → (index-status, worktree-status).
    rc, out = _git(root, "status", "--porcelain=v2", "--", *paths)
    if rc != 0:
        raise ApiError(500, out or "git status failed")
    status_of: dict[str, tuple[str, str]] = {}
    untracked: set[str] = set()
    for line in out.splitlines():
        if line.startswith("? "):
            untracked.add(_unquote_c(line[2:]).rstrip("/"))
        elif line.startswith("1 "):
            tokens = line.split(" ")
            if len(tokens) < 3:
                continue
            status_of[_unquote_c(tokens[-1])] = (tokens[1][0], tokens[1][1])
        elif line.startswith("2 "):
            rest = line[2:]
            head_part, _, _old = rest.partition("\t")
            xy_tokens = head_part.split(" ")
            if len(xy_tokens) < 3:
                continue
            status_of[_unquote_c(xy_tokens[-1])] = (xy_tokens[0][0], xy_tokens[0][1])

    errors: list[str] = []
    for raw in paths:
        path = raw.rstrip("/")
        target = root / path
        if path in untracked or (path not in status_of and not target.exists()):
            # Untracked file (or a directory of them): gone from disk.
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
            elif target.exists():
                target.unlink(missing_ok=True)
            continue
        x, y = status_of.get(path, (" ", " "))
        if x == "A":
            rc, out = _git(root, "rm", "-f", "--", path)
        elif x == "D":
            rc, out = _git(root, "checkout", "HEAD", "--", path)  # restore deleted file
        else:
            rc, out = _git(root, "checkout", "--", path)
        if rc != 0:
            errors.append(out or f"could not discard {path}")
    if errors:
        raise ApiError(500, "; ".join(errors))


# --- issue 42: history ---------------------------------------------------------

_LOG_FMT = "%H%x1f%h%x1f%an%x1f%at%x1f%s%x1f%b%x1e"


def _refs_by_sha(root: Path) -> dict[str, list[str]]:
    """sha → [branch/tag names] (refs/heads + refs/tags)."""
    rc, out = _git(
        root, "for-each-ref", "refs/heads", "refs/tags",
        "--format=%(objectname)%00%(refname:strip=2)",
    )
    refs: dict[str, list[str]] = {}
    if rc == 0:
        for line in out.splitlines():
            sha, _, name = line.partition("\x00")
            if sha and name:
                refs.setdefault(sha, []).append(name)
    return refs


def _parse_log_record(rec: str) -> dict | None:
    rec = rec.strip()
    if not rec:
        return None
    parts = rec.split("\x1f", 5)
    if len(parts) < 5:
        return None
    sha, short, author, ts, subject = parts[:5]
    body = parts[5] if len(parts) > 5 else ""  # %b is absent when the body is empty
    try:
        ts_i = int(ts)
    except ValueError:
        ts_i = 0
    return {
        "sha": sha, "short": short, "author": author, "ts": ts_i,
        "subject": subject, "body": body.strip(),
        "refs": [],
    }


def log(root: Path, limit: int = 50, skip: int = 0) -> dict:
    """Bounded commit history, newest first. Empty shape when no repo/commits."""
    if not git_available():
        return {"commits": [], "total": 0}
    st = repo_status(root)
    if not st["repo"] or not st["initialized"]:
        return {"commits": [], "total": 0}
    limit = max(1, min(int(limit), 200))
    skip = max(0, int(skip))

    rc, out = _git(root, "log", f"--skip={skip}", f"--max-count={limit}",
                   f"--pretty=format:{_LOG_FMT}")
    if rc != 0:
        raise ApiError(500, out or "git log failed")
    commits = [c for c in (_parse_log_record(r) for r in out.split("\x1e")) if c]

    refs = _refs_by_sha(root)
    for c in commits:
        c["refs"] = refs.get(c["sha"], [])

    rc, total = _git(root, "rev-list", "--count", "HEAD")
    return {"commits": commits, "total": int(total) if rc == 0 and total.isdigit() else len(commits)}


def commit_info(root: Path, sha: str) -> dict:
    """One commit's metadata + per-file numstat (for the commit-diff view)."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    rc, out = _git(root, "rev-parse", "--verify", "-q", f"{sha}^{{commit}}")
    if rc != 0 or not out.strip():
        raise ApiError(404, "unknown commit")

    rc, out = _git(root, "show", "-s", f"--pretty=format:{_LOG_FMT}", sha)
    if rc != 0:
        raise ApiError(500, out or "git show failed")
    c = _parse_log_record(out)
    if not c:
        raise ApiError(500, "could not parse commit")

    files: list[dict] = []
    rc, out = _git(root, "show", "--numstat", "--format=", sha)
    if rc == 0:
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            added, removed, path = parts[0], parts[1], _unquote_c(parts[2])
            binary = added == "-" or removed == "-"
            src = None
            if " => " in path:  # numstat rename form: old => new
                src, path = (p.strip() for p in path.split(" => ", 1))
            files.append({
                "path": path, "from": src,
                "added": int(added) if not binary else 0,
                "removed": int(removed) if not binary else 0,
                "binary": binary,
            })
    c["files"] = files
    return c


def file_diff(root: Path, sha: str, path: str) -> dict:
    """Unified diff of one file at one commit (vs. its parent / empty tree)."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    rc, out = _git(root, "rev-parse", "--verify", "-q", f"{sha}^{{commit}}")
    if rc != 0 or not out.strip():
        raise ApiError(404, "unknown commit")

    # Binary check via numstat restricted to the file.
    rc, out = _git(root, "show", "--numstat", "--format=", sha, "--", path)
    if rc != 0:
        raise ApiError(500, out or "git show failed")
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and (parts[0] == "-" or parts[1] == "-"):
            return {"file": path, "binary": True, "diff": ""}

    rc, out = _git(root, "show", "--format=", sha, "--", path)
    if rc != 0:
        raise ApiError(500, out or "git show failed")
    if not out.strip():
        raise ApiError(404, f"no diff for {path} in this commit")
    return {"file": path, "binary": False, "diff": out}


# --- issue 42: branches ---------------------------------------------------------

def branches(root: Path) -> dict:
    """Local branches with the current one marked. Empty shape before first commit."""
    if not git_available():
        return {"branches": [], "current": None}
    st = repo_status(root)
    if not st["repo"] or not st["initialized"]:
        return {"branches": [], "current": None}
    rc, out = _git(root, "branch", "--format=%(refname:short)%00%(HEAD)")
    if rc != 0:
        raise ApiError(500, out or "git branch failed")
    items: list[dict] = []
    current: str | None = None
    for line in out.splitlines():
        name, _, mark = line.partition("\x00")
        if not name:
            continue
        if mark.strip() == "*":
            current = name
        items.append({"name": name, "current": mark.strip() == "*"})
    return {"branches": items, "current": current}


def create_branch(root: Path, name: str) -> dict:
    """Validate the name and create + switch to a new branch from HEAD."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")
    rc, out = _git(root, "check-ref-format", "--branch", name)
    if rc != 0:
        raise ApiError(400, out or f"invalid branch name: {name}")
    rc, out = _git(root, "switch", "-c", name)
    if rc != 0:
        raise ApiError(409, out or f"could not create branch {name}")
    return {"ok": True}


def switch_branch(root: Path, name: str) -> dict:
    """git switch to an existing local branch; dirty-tree refusal → 409 + stderr."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    if not repo_status(root)["repo"]:
        raise ApiError(409, "not a git repository")
    rc, _ = _git(root, "show-ref", "--verify", "--quiet", f"refs/heads/{name}")
    if rc != 0:
        raise ApiError(404, f"no such branch: {name}")
    rc, out = _git(root, "switch", name)
    if rc != 0:
        raise ApiError(409, out or f"could not switch to {name}")
    return {"ok": True}


def checkout_commit(root: Path, sha: str) -> dict:
    """Move HEAD to a commit (detached). Dirty-tree refusal → 409 + stderr."""
    if not git_available():
        raise ApiError(500, "git binary not found")
    rc, out = _git(root, "rev-parse", "--verify", "-q", f"{sha}^{{commit}}")
    if rc != 0 or not out.strip():
        raise ApiError(404, "unknown commit")
    rc, out = _git(root, "switch", "--detach", sha)
    if rc != 0:
        raise ApiError(409, out or f"could not checkout {sha}")
    return {"ok": True}
