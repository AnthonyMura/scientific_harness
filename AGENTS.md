# Environment notes for agents

Workspace \\wsl.localhost\Ubuntu\home\nk\code\scientific_harness is a UNC path into WSL2 (distro: **Ubuntu**, version 2).

Access map (verified 2026-07):
- File tools (read/write/edit/glob/grep) work directly on this path — prefer them; no shell needed. Note: the write tool's atomic rename fails on this share (ENOTSUP); create/replace files via `wsl.exe` or pwsh full-access instead.
- Sandboxed `pwsh` commands fail at initialization (`GetNamedSecurityInfoW` cannot resolve UNC roots, error looks like `GetNamedSecurityInfoW failed (Win32 1)`). Do NOT retry sandboxed shell calls here — they always fail; use `danger-full-access` for any shell work in this workspace.
- Pass multi-line bash scripts to WSL via a stdin pipe (`$script | wsl.exe -d Ubuntu -- bash`) instead of inlining them as a `-lc` argument: pwsh native-command re-quoting mangles embedded double quotes.
- Run Linux commands via: `wsl.exe -d Ubuntu -- bash -lc '<cmd>'`. Set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first to avoid garbled output. Bundle multiple checks into one call.
- **pwsh→WSL heredoc gotcha**: when piping a script into `wsl.exe ... bash`, the final line of the here-document delimiter arrives with a trailing CR, so bash never recognises it as the terminator and the marker leaks into stdin. Use a quoted delimiter (`<<'PYEOF'`) - an unquoted one also expands `$var` and backticks in the body (backticks run as commands) - and end the python body with `sys.exit(0)` — the file write completes before the stray marker line would execute (a cosmetic NameError may still print).
- **pwsh→native-arg backslashes**: Windows paths passed as arguments to native commands arrive with every backslash stripped (`& wsl.exe -d Ubuntu -- bash "$wslPath"` reaches WSL as `C:Users...`), so `wslpath` is useless here. Compute the WSL-side form in pwsh — `$p -replace '\\','/' -replace '^C:', '/mnt/c'` — and pass that instead.
- **Node in WSL**: use `~/nodejs` (per-machine install from the nodejs.org tarball; add `export PATH=$HOME/nodejs/bin:$PATH` to ~/.bashrc). Distro system node can be too old - office machine (user minkota) shipped with 18.x, which breaks Vite >=7 / rolldown; Node 22.23.2 installed there 2026-07. Full dev cycle (Vite :5199 + sidecar :8765 + headless Chrome CDP) verified on the office machine.
- **Headless Chrome (UI verification)**: the managed Chrome build here prints nothing for `--dump-dom` (and even `--version`) — drive it over CDP instead. Start `chrome.exe --headless=new --no-sandbox --disable-gpu --user-data-dir=<fresh> --remote-debugging-port=9333 about:blank` with `--window-size=1600,900` (the default 800×600 viewport clips right-side panes), then run a Node script using built-in `fetch` + `WebSocket`: poll `/json/version`, open the tab with `PUT /json/new?http://127.0.0.1:5199`, wait for `Page.loadEventFired`, and focus the editor with a real `Input.dispatchMouseEvent` triple (mouseMoved/mousePressed/mouseReleased) — `element.focus()` does not work headless. Probe state with `Runtime.evaluate` (`returnByValue`); persisted UI state (settings, layout) is readable from localStorage. For unload-time writes in page tests, listen to both `beforeunload` and `pagehide` (which fires varies by run) and use `fetch(..., {keepalive:true})` — synchronous XHR is aborted mid-teardown in this Chrome build.
- If the session permission preset is `danger-full-access`, these run without per-command approval prompts; otherwise each needs approval (or type `/permission danger-full-access` once per session).

Project context: see docs/workbench_v0_plan.md (the active build plan) and docs/technical_description_v3.md (current conception — module-based scientific writing software: editor with split-pane rewrite, LaTeX profiles, built-in Zotero, student data intake, LLM conductor, research parser).

## Development workflow (workbench v0)

The app lives in `workbench/` (browser-first dev mode; the Electron shell comes later):

- **Dev server**: Vite at `127.0.0.1:5199` (`workbench/web`, HMR on). inotify events are unreliable on this WSL/UNC share, so the config sets `server.watch.usePolling: true` — keep it; without polling a missed change event leaves Vite serving a stale transform indefinitely (`.scratch/module-workbench/resolved/32-vite-stale-transform.md`). If app behavior looks older than the code on disk, diff `curl http://127.0.0.1:5199/src/<module>` against disk before debugging app logic.
- **Sidecar**: FastAPI at `127.0.0.1:8765`, token `devtoken` in header `X-Workbench-Token`. Launch from WSL: `cd workbench/backend && WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765 --reload`. With `--reload`, backend `.py` changes are picked up automatically (the in-memory job registry resets on reload).
- **Production build (WSL only)** — Windows-side builds fail. Inside WSL: `export PATH=$HOME/nodejs/bin:$PATH; cd workbench/web && node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build`.
- **File writes**: the write tool's atomic rename fails on this share (ENOTSUP). Create/replace files via a pwsh single-quoted here-string → temp `.sh` → `wsl.exe -d Ubuntu -- bash <wslPath>` (compute `<wslPath>` in pwsh as `$p -replace '\\','/' -replace '^C:', '/mnt/c'` — see the backslash note above); use quoted heredoc delimiters (`<<'EOF_X'`) when the content contains `${...}`. Reads work directly on UNC.
- **esbuild**: `node_modules/esbuild/bin/esbuild` is an ELF binary — use the JS API (`require('esbuild').buildSync(...)`).
- **In-app TeX**: LaTeX comes from an in-app TinyTeX in `workbench/.texlive` (hidden, gitignored; installed/updated from the Install panel, managed by `backend/workbench_backend/tinytex.py`). The home WSL also has apt TeX Live 2025 on PATH (`/usr/bin/pdflatex`) as a fallback — do not install system TeX to make compiles work; extend the app-local tree instead. Missing packages are added on demand during compile, but only for TinyTeX-backed engines (issue 58: the `system`/`ssh` targets never auto-install).
- **Test project**: `/home/nk/code/test-latex-project` is the standing end-to-end compile target.

Folder layout:
- AGENTS.md — this file
- README.md — project index
- docs/ — conception documents (v1 original → v2 → v3), the active plan workbench_v0_plan.md, and INSTALL.md (install & run guide for lab machines)
- docs/reviews/ — external reviews of the conception
- external/ — reference material that is not part of the project
- workbench/ — the v0 app: `web/` (React + Vite UI), `backend/` (FastAPI sidecar, venv in `.venv`), `.texlive/` (in-app TinyTeX, gitignored)
- .scratch/ — issue tracker and specs per feature (open tickets in `issues/`, resolved ones in `resolved/`)
## Agent skills

### Issue tracker

Local markdown: issues and specs live as files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary, label string equals role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Development rules (ticket → branch → tests → merge)

Standing rules for any agent doing implementation work in this repo:

1. **Ticket first, then own branch per implementation task.** Before writing code:
   - Open the `.scratch/` ticket for the change — create it if missing, even if short; an implementation task without a ticket is not started (see Ticket trail).
   - Check freshness first (`git fetch && git status`; if behind, `git pull --rebase` — see Version control).
   - Create a dedicated branch from the up-to-date `main`, named `<type>/<ticket-slug>`, e.g. `fix/49-remove-install-tex-button`, `feat/zotero-sync`.
   - Never commit implementation work directly on `main`. Exception: docs-only or ticket-only changes (no code, no test impact) may go straight to `main`, as routine commits already do.
2. **Tests are part of the change.** Every implementation task ships tests for the behavior it adds or changes — a change without tests is not done:
   - Backend (Python): pytest, tests under `workbench/backend/tests/` (declared as the `dev` extra in pyproject.toml; on a fresh venv run `./.venv/bin/pip install pytest`). Run: `cd workbench/backend && ./.venv/bin/python -m pytest`.
   - Web (TypeScript): vitest, tests colocated as `*.test.ts(x)` under `workbench/web/src/` (node environment — no DOM; add jsdom when component tests land). Run: `cd workbench/web && node_modules/.bin/vitest run` (`npm test`). UI behavior still needs headless-Chrome verification (see Environment notes).
   - Tests must exercise the new/changed logic (not just import smoke); failing or skipped tests block the merge.
3. **Merge gate.** An agent may merge its branch into `main` only when all hold:
   - full suite green: backend pytest + web vitest + typecheck/build,
   - UI behavior changed → headless-Chrome CDP verification done (see Environment notes),
   - working tree clean, every change committed with a scoped message (one logical module per commit),
   - docs current per the standing request (README status line, plan progress note, AGENTS.md if the workflow changed).
   Rebase onto a fresh `main` and merge with `git merge --ff-only`, then push immediately (see Multi-machine workflow). If tests fail, fix on the branch — never merge around failures; record the state in the ticket under `.scratch/` instead.
4. **Ticket trail.** The branch name carries the ticket number (`<type>/<ticket-slug>`); when the merge lands, move the ticket to `resolved/` (issue-tracker skill).

5. **Multi-machine workflow (home ↔ lab).** Development continues across machines:
   - Every session starts with `git fetch && git status`; if behind, `git pull --rebase` before any work.
   - Push immediately after each merge so the other machine can pull right away; never end a session with merged-but-unpushed work.
   - Each machine keeps its own `.venv` and `node_modules` (both gitignored — set up per docs/INSTALL.md); never commit local artifacts, and expect paths that exist on one machine to be absent on the other.

## Version control

- **Remote**: `origin` -> https://github.com/AnthonyMura/scientific_harness (public; clone and dev-mode setup documented in README)
- **Releases**: a release is an annotated tag `vX.Y.Z` on a `chore(release): vX.Y.Z — ...` commit, pushed to origin. First release: v0.1.0 (2026-07); install & run guide in docs/INSTALL.md.
- Commit messages are scoped by module so history shows where each change landed:
  - `module(<name>): <summary>` — app modules: backend, app-shell, layout, workbench-shell, explorer, editor, pdf-viewer, log-panel, install
  - `web(core): <summary>` — shared web plumbing (api client, types, Vesper theme, icons, base styles)
  - `app: <summary>` — top-level shell wiring (App.tsx, ProjectBar)
  - `docs(<area>):` / `chore(<area>):` — documentation and repo hygiene
- One logical module change per commit. Build artifacts (node_modules, dist, .venv, __pycache__) stay ignored via workbench/.gitignore.
- **Check branch freshness before adding a new ticket**: always run `git fetch && git status` first — if the local branch is behind origin (outdated), update it (`git pull --rebase`) before writing or committing the ticket, so modifications are never added on top of an outdated branch.
- **Commit before ending work**: at the end of every task or session, commit all changes — code, docs, tickets — so the working tree is left clean. If something is genuinely unfinished, record its state in the relevant issue ticket under `.scratch/` instead of leaving it uncommitted.
- **Update repository information after every change** (standing user request): besides the scoped code commits, keep the guides current — the `README.md` status line, the progress note in `docs/workbench_v0_plan.md`, and `AGENTS.md` itself whenever a workflow or environment fact changes. Commit each under its own scope (`docs(...)`, `chore(...)`); do not let docs lag behind shipped behavior.
