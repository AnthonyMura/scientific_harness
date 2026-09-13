# Environment notes for agents

Workspace \\wsl.localhost\Ubuntu\home\nk\code\scientific_harness is a UNC path into WSL2 (distro: **Ubuntu**, version 2).

Access map (verified 2026-07):
- File tools (read/write/edit/glob/grep) work directly on this path — prefer them; no shell needed. Note: the write tool's atomic rename fails on this share (ENOTSUP); create/replace files via `wsl.exe` or pwsh full-access instead.
- Sandboxed `pwsh` commands fail at initialization (`GetNamedSecurityInfoW` cannot resolve UNC roots, error looks like `GetNamedSecurityInfoW failed (Win32 1)`). Do NOT retry sandboxed shell calls here — they always fail; use `danger-full-access` for any shell work in this workspace.
- Pass multi-line bash scripts to WSL via a stdin pipe (`$script | wsl.exe -d Ubuntu -- bash`) instead of inlining them as a `-lc` argument: pwsh native-command re-quoting mangles embedded double quotes.
- Run Linux commands via: `wsl.exe -d Ubuntu -- bash -lc '<cmd>'`. Set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first to avoid garbled output. Bundle multiple checks into one call.
- If the session permission preset is `danger-full-access`, these run without per-command approval prompts; otherwise each needs approval (or type `/permission danger-full-access` once per session).

Project context: see docs/workbench_v0_plan.md (the active build plan) and docs/technical_description_v3.md (current conception — module-based scientific writing software: editor with split-pane rewrite, LaTeX profiles, built-in Zotero, student data intake, LLM conductor, research parser).

## Development workflow (workbench v0)

The app lives in `workbench/` (browser-first dev mode; the Electron shell comes later):

- **Dev server**: Vite at `127.0.0.1:5199` (`workbench/web`, HMR on).
- **Sidecar**: FastAPI at `127.0.0.1:8765`, token `devtoken` in header `X-Workbench-Token`. Launch from WSL: `cd workbench/backend && WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765 --reload`. With `--reload`, backend `.py` changes are picked up automatically (the in-memory job registry resets on reload).
- **Production build (WSL only)** — Windows-side builds fail. Inside WSL: `export PATH=/home/nk/nodejs/bin:$PATH; cd workbench/web && node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build`.
- **File writes**: the write tool's atomic rename fails on this share (ENOTSUP). Create/replace files via a pwsh single-quoted here-string → temp `.sh` → `wsl.exe -d Ubuntu -- bash <wslPath>`; use quoted heredoc delimiters (`<<'EOF_X'`) when the content contains `${...}`. Reads work directly on UNC.
- **esbuild**: `node_modules/esbuild/bin/esbuild` is an ELF binary — use the JS API (`require('esbuild').buildSync(...)`).
- **In-app TeX**: LaTeX comes from an in-app TinyTeX in `workbench/.texlive` (hidden, gitignored; installed/updated from the Install panel, managed by `backend/workbench_backend/tinytex.py`). This machine has no system TeX — do not install one to make compiles work; extend the app-local tree instead. Missing packages are added on demand during compile (see issue 06).
- **Test project**: `/home/nk/code/test-latex-project` is the standing end-to-end compile target.

Folder layout:
- AGENTS.md — this file
- README.md — project index
- docs/ — conception documents (v1 original → v2 → v3) and the active plan workbench_v0_plan.md
- docs/reviews/ — external reviews of the conception
- external/ — reference material that is not part of the project
- workbench/ — the v0 app: `web/` (React + Vite UI), `backend/` (FastAPI sidecar, venv in `.venv`), `.texlive/` (in-app TinyTeX, gitignored)
- .scratch/ — issue tracker and specs per feature
## Agent skills

### Issue tracker

Local markdown: issues and specs live as files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary, label string equals role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Version control

- Commit messages are scoped by module so history shows where each change landed:
  - `module(<name>): <summary>` — app modules: backend, app-shell, layout, workbench-shell, explorer, editor, pdf-viewer, log-panel, install
  - `web(core): <summary>` — shared web plumbing (api client, types, Vesper theme, icons, base styles)
  - `app: <summary>` — top-level shell wiring (App.tsx, ProjectBar)
  - `docs(<area>):` / `chore(<area>):` — documentation and repo hygiene
- One logical module change per commit. Build artifacts (node_modules, dist, .venv, __pycache__) stay ignored via workbench/.gitignore.
- **Commit before ending work**: at the end of every task or session, commit all changes — code, docs, tickets — so the working tree is left clean. If something is genuinely unfinished, record its state in the relevant issue ticket under `.scratch/` instead of leaving it uncommitted.
