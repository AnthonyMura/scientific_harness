# Environment notes for agents

Workspace \\wsl.localhost\Ubuntu\home\nk\code\scientific_harness is a UNC path into WSL2 (distro: **Ubuntu**, version 2).

Access map (verified 2026-07):
- File tools (read/write/edit/glob/grep) work directly on this path — prefer them; no shell needed. Note: the write tool's atomic rename fails on this share (ENOTSUP); create/replace files via `wsl.exe` or pwsh full-access instead.
- Sandboxed `pwsh` commands fail at initialization (`GetNamedSecurityInfoW` cannot resolve UNC roots, error looks like `GetNamedSecurityInfoW failed (Win32 1)`). Do NOT retry sandboxed shell calls here — they always fail; use `danger-full-access` for any shell work in this workspace.
- Pass multi-line bash scripts to WSL via a stdin pipe (`$script | wsl.exe -d Ubuntu -- bash`) instead of inlining them as a `-lc` argument: pwsh native-command re-quoting mangles embedded double quotes.
- Run Linux commands via: `wsl.exe -d Ubuntu -- bash -lc '<cmd>'`. Set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` first to avoid garbled output. Bundle multiple checks into one call.
- If the session permission preset is `danger-full-access`, these run without per-command approval prompts; otherwise each needs approval (or type `/permission danger-full-access` once per session).

Project context: see docs/workbench_v0_plan.md (the active build plan) and docs/technical_description_v3.md (current conception — module-based scientific writing software: editor with split-pane rewrite, LaTeX profiles, built-in Zotero, student data intake, LLM conductor, research parser).

Folder layout:
- AGENTS.md — this file
- README.md — project index
- docs/ — conception documents (v1 original → v2 → v3) and the active plan workbench_v0_plan.md
- docs/reviews/ — external reviews of the conception
- external/ — reference material that is not part of the project
## Agent skills

### Issue tracker

Local markdown: issues and specs live as files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary, label string equals role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
