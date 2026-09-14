# 13 — M4: ssh compile target (remote TeX on a LAN machine)

Status: resolved (2026-09-14)

## Scope

Plan section 5, milestone M4: the fourth implementation of the compile-target
interface. Key-based ssh to any machine; the project is synced to a working
directory there, compiled with latexmk, and PDF + synctex (+ log) are pulled
back into the local build directory so the existing PDF viewer, SyncTeX
lookups, and log panel work unchanged. Acceptance: compile a project against
a machine on the LAN; artifacts appear in the app and sync works against the
remote paths (plan risk 2 — the backend normalizes synctex paths to the local
canonical form before any lookup).

## Design

- **Per-project config** in `<project>/.workbench/project.json`:
  `ssh = { host, user, port?, key?, remote_dir? }`. `remote_dir` defaults to
  `~/workbench/<project-name>` on the remote. Auth is key-based only
  (`BatchMode=yes` — never a password prompt); `key` optional (defaults to
  normal ssh agent/key resolution).
- **targets.py — `SshTarget`**:
  - `check()`: one ssh round trip probing `latexmk --version` on the remote;
    reports version or a precise failure (no ssh binary, unreachable host,
    no TeX there).
  - `run_latexmk()`: returns a local `bash -c` Popen that (1) echoes a sync
    banner, (2) pushes the project with `tar -C root --exclude=.workbench . |
    ssh ... 'cd remote_dir && tar -xf -'`, (3) `exec ssh ... 'cd remote_dir &&
    latexmk <args> -output-directory=build main.tex'`. The job log therefore
    streams sync + compile output like any other target.
  - `collect_artifacts()`: new optional method on the `CompileTarget` base
    (no-op for local/wsl). Pulls `{stem}.pdf`, `{stem}.synctex.gz`,
    `{stem}.log` from `<remote_dir>/build/` back into the local build dir
    (ssh `cat`, binary-safe), then rewrites the synctex `Input:` lines from
    the remote absolute root to the local project root so frontend path
    matching works unchanged.
- **compile_service.py**: `_pump` calls `target.collect_artifacts(...)` after
  the retry loop, before artifact detection (failures are logged, not fatal).
- **app.py / projects.py / install.py**: `PUT /api/config` accepts a
  validated `ssh` dict; project dicts expose `ssh` for form prefill;
  `/api/install/status` gains an `ssh` probe entry (configured? reachable?
  remote TeX found?) with an in-app prerequisite hint — the app cannot
  unattended-install TeX on an arbitrary remote, so `can_install` stays off.
- **Web**: "ssh" joins the compile-target selector (`targets-ui.ts`,
  tooltip + warning chip via the probe entry); a small SSH settings form in
  the top bar (host / user / port / key path / remote dir) saves through
  `PUT /api/config`.

## Verification

- **E2E against a real SSH server (localhost stand-in).** WSL has no sudo
  (password required), so `openssh-server` could not be installed. Instead an
  ephemeral paramiko-based SSH server (`/tmp/wb_ssh_test/sshd_stub.py`, not in
  the repo) listens on 127.0.0.1:2222, authenticates a generated ed25519 key,
  and runs `exec` requests through bash with the in-app TinyTeX bin dir on
  PATH — it behaves as the remote leg of a real sshd for everything this
  target uses (session exec, stdin/stdout piping, exit status). The standing
  test project was copied to `/tmp/wb_ssh_test/proj` with `target=ssh`
  pointing at that stub; the canonical test project was left untouched.

  Results (clean-room: remote dir and local build wiped first):
  - `check()` → `TeX found on nk@127.0.0.1 — Latexmk, John Collins, ... Version 4.88`.
  - `run_latexmk` → sync banner, fresh remote pdflatex run (exit 0), no stale
    "up-to-date" shortcut.
  - `collect_artifacts` → `main.pdf` (249 KB, valid `%PDF-1.7` header) plus
    `main.synctex.gz` and the log pulled into the local build dir.
  - SyncTeX: 27 `Input:` lines, all rewritten to the local project root, zero
    leaking remote paths — so PDF↔source sync works against a remote compile
    unchanged (plan risk 2).

- **HTTP level** (live sidecar with token):
  - `PUT /api/config` with an `ssh` dict round-trips; out-of-range or
    non-numeric ports are dropped, numeric strings coerced to int, blank
    strings dropped.
  - `/api/projects/open` and `/api/config` echo the stored ssh config for
    form prefill.
  - `GET /api/install/status` → ssh entry with `available`, `tex_found`, the
    remote latexmk version in `detail`, and `can_install: false` plus the
    "set TeX up on the remote yourself" hint.

- **Web**: `tsc --noEmit` clean, vite build OK; "SSH (remote)" option in the
  compile-target selector, top-bar SSH settings form saving through
  `PUT /api/config`.

## Caveats

- The LAN leg (a real second machine with sshd + TeX) has not been exercised —
  the localhost paramiko stand-in covers the protocol behavior but not a
  genuine OpenSSH server or a network hop. Everything else in the acceptance
  criteria is verified.
- Cancellation limitation: cancelling the job kills the local `bash -c`
  wrapper; a remote latexmk already running may continue until it finishes on
  its own (same class of limitation as the wsl target note).
- The stub lives in `/tmp` (ephemeral) and paramiko remains pip-installed in
  the backend venv (gitignored) so the E2E can be re-run; neither is part of
  the app.
