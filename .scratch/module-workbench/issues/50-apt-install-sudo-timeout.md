# 50 — Install TeX (local/apt) fails with "sudo: timed out" — no TTY for the password prompt

Status: needs-triage
Machine: home

## Request (user)

"one more ticket, install tex function in install tex module returns sudo:
timed out". Job log as seen in the Install panel:

```
$ sudo bash -lc 'export DEBIAN_FRONTEND=noninteractive; apt-get update -y && apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra latexmk && echo WORKBENCH_APT_DONE'
sudo: timed out
```

The job then ends in error — no TeX installed, no actionable hint.

## Where it comes from (code)

All in `workbench/backend/workbench_backend/install.py`:

- Lines 44–47: `APT_SCRIPT` — the exact command quoted above.
- Line 92: `is_root = hasattr(os, "geteuid") and os.geteuid() == 0`.
- Line 93 (`local_install_spec`, linux branch):
  `cmd = ["bash", "-lc", APT_SCRIPT] if is_root else ["sudo", "bash", "-lc", APT_SCRIPT]`
  — the sidecar runs as a normal WSL user (non-root), so it prepends `sudo`.
- Lines 319–324 (`start_install`, target "local") run that spec; lines 332–345
  (`_pump_install`) start it with `subprocess.Popen(cmd, stdout=PIPE,
  stderr=STDOUT)` — no TTY, inherited stdin. The `$ sudo bash -lc ...` line in
  the job log is emitted by `_pump_install` itself (line 333).
- Root cause (to confirm at claim time): with no TTY and no askpass, `sudo`
  cannot obtain a password for a non-root user; it waits and dies with
  "sudo: timed out". The probe hint already admits the weakness — lines 94–97:
  "Needs root; sudo may ask for a password." — but nothing handles it at run
  time.
- Contrast: the WSL target uses `wsl.exe -u root` (lines 258, 317) — no
  password prompt, fully unattended, and that path works.

## Fix direction

1. Pre-flight check: probe (`probe_local`) and install (`start_install`, local
   branch) run `sudo -n true` first. Non-root without passwordless sudo → the
   local target is reported `can_install=False` with a clear reason, and an
   install attempt fails fast instead of hanging until sudo times out.
2. Actionable failure: when it can't run unattended, surface the exact command
   to paste into a WSL terminal — `TargetStatus.install_command` already
   carries it (line 200) — plus a pointer to the in-app TinyTeX target (no
   root needed).
3. Open question: is the local apt target worth keeping at all on machines
   where the sidecar itself runs inside WSL? This home machine has no system
   TeX by design (AGENTS.md: extend the app-local tree, don't install a system
   TeX) — the local target may just be noise here.

## Verification plan

- Confirm the mechanism on this machine: `sudo -n true` as the sidecar user
  (expected: fails → no passwordless sudo).
- After fix: probe shows the local target unavailable with a reason; an install
  attempt fails fast with the copy-pasteable command, no multi-second hang.
- Positive path (passwordless sudo available, e.g. test container): full apt
  run completes and the log ends with `WORKBENCH_APT_DONE`.

## Related

- #49 — removing the Install TeX button: if triage removes the whole install
  module, this ticket shrinks to "keep the backend endpoints honest/safe"; the
  sudo failure mode still needs a pre-flight either way.
- #06 — In-app TinyTeX (the root-free alternative this machine should use).

## Comments

New ticket (2026-09-30); user report quoted above, job log captured verbatim.

Claimed 2026-10-01 (home machine). Mechanism confirmed as the sidecar user:

    $ id -un; sudo -n true          # user nk (uid 1000)
    sudo: interactive authentication is required   # exit code 1

`sudo` here is **sudo-rs 0.2.13** (Ubuntu WSL image). No passwordless sudo, no TTY, no askpass — exactly the hang that ends in "sudo: timed out" from the job log above. (A first probe run via a `-lc` one-liner misreported rc=0 — pwsh→WSL re-quoting mangled `$?`; a clean stdin-pipe run is authoritative.)

Decision on the open question (fix direction item 3): **keep the local apt endpoint, make it honest/safe — do not delete.** Rationale: on this machine (sidecar inside WSL, no passwordless sudo) the in-app TinyTeX target is the right path and the local card would be noise; but on other Linux hosts (lab machines running the sidecar natively as a user with passwordless sudo, or root containers) one-click apt install remains the natural path. Deleting would break those; an honest `can_install=False` plus the copy-pasteable command keeps both worlds.