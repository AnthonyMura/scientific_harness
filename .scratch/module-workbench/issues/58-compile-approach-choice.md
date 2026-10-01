# 58 — Compile approach choice: TinyTeX / system TeX / SSH per project

Status: needs-triage
Machine: home

## Request (user)

"User needs an opportunity to choose which approach to use compile his project. Tiny tex? SSH? Local tex in the system." — with the follow-up instruction to expand the idea and create a new ticket (2026-10-02, m00001).

## Current state

- `workbench/backend/workbench_backend/targets.py` — one `CompileTarget` interface, four names resolvable via `get_target(name, root)`:
  - `local` (`LocalTarget`) — composite: in-app TinyTeX first (`tinytex.find_prefix()` → hidden `workbench/.texlive`, bin dir PATH-injected), then any system TeX on PATH (MiKTeX / TeX Live / MacTeX). The two sources are **not** individually selectable; when both exist, TinyTeX silently wins.
  - `wsl` (`WslTarget`) — Windows hosts only; prefers the app's `.texlive` prefix as seen from inside the distro, then the distro's own latexmk.
  - `ssh` (`SshTarget`) — key-based ssh to a remote machine (per-project `host/user/port/key/remote_dir`), tar-over-ssh sync up, remote latexmk, PDF + synctex (+ log) pulled back with synctex `Input:` paths rewritten to the local root (#13).
  - `auto` — local first, then wsl on Windows; raises 501 with an install hint when nothing is found.
- UI: top-bar "Target" selector (`workbench/web/src/components/ProjectBar.tsx`, pure helpers in `workbench/web/src/modules/targets-ui.ts`) offers Auto / Local (host TeX) / WSL (when offered) / SSH (remote); per-target tooltip from the `/api/install/status` probe; red warning chip linking to the Install panel when the selected target lacks TeX. Persisted per project via `PUT /api/config {project:{target}}`.
- Probe: `GET /api/install/status` reports one combined entry for `local` (tinytex-or-system) plus `wsl`/`ssh` entries; the UI cannot distinguish "TinyTeX installed" from "system TeX installed".

## Gap

The user wants an explicit choice of **approach**: in-app TinyTeX vs system TeX on this machine vs SSH remote. Today the only axis is local/wsl/ssh/auto, and within `local` the source is decided silently by priority. Consequences:
- A user with a full system TeX Live cannot force it — TinyTeX shadows it.
- No per-project predictability of which engine compiles ("this paper compiles on my university SSH box; this one uses TinyTeX") beyond picking local vs ssh.
- Reactive missing-package repair (`tinytex.maybe_install_missing`, #06/#57) applies to TinyTeX only; when system TeX is the source, a missing `.sty` fails with no in-app remedy — worth surfacing rather than hiding.

## Proposed direction (not yet implemented)

Split the local axis into explicit first-class approaches while keeping old values working:

1. **Backend (`targets.py`, consumed by `compile_service`)**
   - New target names:
     - `tinytex` — in-app TinyTeX only. `check()` reports install state + version, or a precise "not installed — open the Install panel" failure; `run_latexmk` raises with the same hint when missing (no silent fallback to system TeX).
     - `system` — system TeX on PATH only (MiKTeX / TeX Live / MacTeX); explicitly skips the in-app prefix even if present.
   - Keep `local` as a backward-compatible alias of today's composite behavior (tinytex → system) so existing project configs keep their meaning; `auto` order stays tinytex → system → wsl (Windows).
   - `get_target` maps the new names; unknown values keep raising 400.
2. **Probe (`install.py`, `/api/install/status`)** — split the combined local entry into separate `tinytex` and `system` entries (each: available?, version/detail, install hint for tinytex) so the UI can render each option's real state; `wsl`/`ssh` entries unchanged.
3. **Web (`ProjectBar.tsx`, `targets-ui.ts`)** — selector options become Auto / In-app TinyTeX / System TeX / SSH (remote) / WSL (Windows hosts), labeled so the approach is self-evident; per-option tooltip from the split probe; warning chip when the chosen approach is unavailable (chip → Install panel for tinytex, plain hint otherwise). Persistence via the existing `PUT /api/config {project:{target}}`.
4. **Surface the behavioral difference** — on-demand package repair (#06) applies to TinyTeX only; compiling with the system target does not auto-install missing packages (documented limitation, same as today's local-when-system-wins case).

## Verification plan (for whoever implements)

- pytest: `get_target` mapping for the new names + alias behavior (`local` still composite, `auto` order unchanged); `tinytex` target refuses to run when the prefix is missing; `system` target ignores an existing in-app prefix (monkeypatched `tinytex.find_prefix` / `shutil.which`).
- vitest: updated `targets-ui.ts` helpers (option list per host, tooltip from split probe entries, needsInstall for each new option).
- Full suite green + `tsc --noEmit` + vite build.
- Headless-Chrome CDP at 127.0.0.1:5199 with the test project (`/home/nk/code/test-latex-project`): selector shows the expanded options; selecting TinyTeX compiles (PDF artifact); switching to System fails cleanly on this machine (no system TeX in home WSL) with the hint chip; SSH option unchanged.
- Backward compat: a project whose config says `target: "local"` still resolves tinytex-first and compiles.

## Related

- #06 — In-app TinyTeX (reactive on-demand package repair lives here)
- #11 — Compile target selector UI (the control this extends)
- #13 — SSH compile target (the remote approach)
- #49 — Install TeX button removal (Install panel remains the home of install flows)
- #57 — TinyTeX add packages on demand (proactive repair for the tinytex approach)

## Comments

New ticket (2026-10-02, home); user request quoted above. Ticket-only creation per user instruction — no implementation started, no branch created.