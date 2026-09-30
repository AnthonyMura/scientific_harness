# 42 — Git module (version control: project state + history)

Status: resolved
Machine: home

## Request (user)

A new "Git" module that shows the project's git version control — "the same
version control as VS Code": the current **state of the project** and its
commit **history**. The project folder is a plain directory on disk (this repo
itself is developed in git), but nothing in the UI exposes it today: a user
cannot see what changed, what is staged, or what earlier versions of the
document looked like without leaving the app.

## Behavior (expanded description)

### Scope and empty states

- Operates on the currently open project directory — the same root the
  Explorer shows. All git work happens in the sidecar, which shells out to the
  system `git`; there is no git engine in the browser.
- Project is **not** a git repository → empty state with an **Initialize
  repository** action (`git init`) and a hint; after init, offer making the
  first commit.
- `git` binary missing on the machine running the sidecar → empty state with
  an install hint (the sidecar runs in WSL/Ubuntu, where git is normally
  present).

### Project state ("Changes", like VS Code's SCM view)

- Header row: current branch (+ detached-HEAD marker), ahead/behind counts vs.
  the upstream remote when one exists, and a refresh indicator.
- File list grouped **Staged** / **Changes** (working tree), mirroring VS Code:
  each row = status badge (M modified, A added/untracked, D deleted, R
  renamed) + path; untracked files appear under Changes with an "A" badge.
- Per-file actions (row hover / context): **Stage** / **Unstage**, **Discard
  changes** (`git checkout -- <file>`, behind a confirm dialog — destructive),
  **Open diff** (HEAD vs. working tree for that file), and open the file in
  the editor / reveal it in the Explorer (existing `openFile` ctx channel).
- Commit box: message textarea + **Commit** button committing the staged set;
  an "include all changes" toggle stages everything first (VS Code's checkbox
  behavior). Empty message → disabled.
- Live state: poll the sidecar status endpoint on a short interval (2–5 s) and
  bump after any in-app file write. Autosave (#20) writes to disk ~1 s after
  typing stops, so edits appear as changes without an explicit save. Polling,
  not watching: inotify is unreliable on this share (#32), and `.git`
  internals churn constantly.

### History ("Git log")

- Commit list, newest first: short hash (mono, code-token styling), author
  name, relative date ("2 h ago"), subject line; full message in a detail row
  or expandable row. Branch/tag decorations on the commits they point at.
- Click a commit → **commit diff**: per-file file list with numstat (+N/−M) and
  a unified-diff view for the selected file — added/removed lines colored from
  Vesper anchors, no new color system. Binary files show "Binary files differ".
- Commit actions: **Checkout** (move HEAD to that commit; confirm when leaving
  the current branch or with a dirty working tree), and possibly **Compare
  with working tree**.
- Bounded fetch: first N commits (e.g. 50) with load-more on scroll, so large
  repos never stall the UI.

### Branches

- Branch picker in the header (VS Code-style dropdown): local branches with a
  checkmark on the current one, click to switch (`git switch`); confirm when
  there are uncommitted changes. New-branch creation from the picker; branch
  deletion at most later.
- Remotes: show remote names (origin, …) in the header context. Fetch/push/
  pull — see open questions; likely out of v0 scope.

## Implementation notes

- **Frontend module registration** (same pattern as #38): `modules/defs.ts`
  (`MODULE_DEFS`, `MODULE_ORDER`) + `modules/registry.tsx` (`MODULES`).
  Singleton; default slot sidebar next to Explorer and Structure. Persisted
  layouts validate module references only, so adding the `git` id is
  backward-compatible with saved layouts.
- **Backend**: new `workbench_backend/git.py` service + endpoints in `app.py`,
  token-gated like everything else (`X-Workbench-Token`). Shell out to system
  git via `subprocess` — list args, no `shell=True`, `-C <project root>`,
  short timeouts. Suggested surface:
  - `GET /api/git/status` — branch, ahead/behind, staged + unstaged entries
    (parse `git status --porcelain=v2`);
  - `GET /api/git/log?limit=` — commits (hash, author, date, subject, body);
  - `GET /api/git/diff?file=&ref=` — unified diff for one file at one ref vs.
    HEAD/working tree (`git diff -- <path>`, `git show --format= -- <path>`);
  - `POST /api/git/stage` / `unstage` / `discard` (per path),
    `POST /api/git/commit` (message, optional stage-all),
    `GET /api/git/branches`, `POST /api/git/checkout` (branch or commit),
    `POST /api/git/init`.
- **Diff rendering**: there is no diff component in `web/src` today — a small
  unified-diff parser/renderer is needed (hunk headers, +/- lines, context).
  Keep it dependency-free first; decide at claim time whether a library earns
  its place. Where the diff renders (inside the module vs. an editor-slot tab)
  is an open question below.
- **Interaction with existing features**:
  - The Explorer already hides dotfiles incl. `.git` (`files.py` tree filter) —
    no change needed; untracked files appear both in the tree and in this
    module's Changes list, consistent with VS Code.
  - Autosave (#20) → status must refresh on file writes; reuse a `treeTick`-
    style bump channel (the #41 stale-flag machinery in `modules/ctx.ts`) or a
    dedicated ctx signal.
  - "Save version" (#18, PDF copies into the project's `versions/` folder) is
    a separate snapshot concept — keep the two visually distinct; do not merge
    them.
  - The v0 plan (`docs/workbench_v0_plan.md`) lists "**git snapshots**" under
    *Out (explicit)*. This ticket asks for real git history/state, not
    app-internal snapshots — triage should confirm the scope distinction and
    update the plan's progress note when this lands.

## Open design questions

- Default slot: sidebar (next to Explorer/Structure) or bottom panel?
- Remote operations in v0: push/pull/fetch need credentials on the sidecar
  machine; local-only (status / history / stage / commit / checkout) may be
  the right cut, remotes later.
- History view: linear list vs. branch-aware graph? Default commit count and
  load-more behavior?
- Per-file history (VS Code Timeline style: this file's commits while it is
  open in the editor) — in scope for v0 or a follow-up ticket?
- Checkout of arbitrary commits: allow detached HEAD, or read-only "view at
  commit" first (safer for a writing app whose working tree *is* the document)?
- Diff presentation: inside the module, a dedicated diff tab in the editor
  slot, or CodeMirror's built-in diff view?
- Refresh cadence: fixed interval vs. event-driven bumps only; cost of
  `git status` on big repos on lab machines.

## Related

- #38 — Structure module (module registration pattern, sidebar slot)
- #41 — Explorer stale refresh (polling + stale-flag precedent in `ctx.ts`)
- #20 — Autosave (edits hit disk without explicit save → status must track writes)
- #18 — Save version (separate snapshot concept; keep distinct)

## Verification plan

TBD at claim time: fixture project with commits, branches and staged /
unstaged / untracked files; CDP checks that the module's state matches
`git status --porcelain`, committing from the UI creates the expected commit,
the diff view matches `git show` for a known change, and a branch switch
updates header + tree.

## Comments

New ticket (2026-09-29); description expanded per user request: "git version
control history — shows history, the state of project; the same version
control as vscode".

Claimed (2026-10-01). Design decisions at claim time:

- **Slot**: sidebar singleton next to Explorer/Structure (matches VS Code's SCM
  placement and the #38 module pattern). History lives inside the module as a
  second tab ("Changes" / "History"), not in the editor slot.
- **Remotes**: names shown in the header context; fetch/push/pull are out of
  v0 scope (local-only operations, per the open question).
- **History**: linear list, newest first, bounded fetch (first 50 + load-more
  via `skip`). No branch graph in v0. Per-file timeline: follow-up ticket.
- **Checkout**: allow detached HEAD (`git switch --detach <sha>`) with a
  confirm when leaving a branch or with a dirty tree — matches VS Code and the
  "same as VS Code" ask; the confirm is the safety net for a writing app.
- **Diff rendering**: dependency-free unified-diff parser/renderer inside the
  module (hunk headers, +/- lines, context). Added lines use the Vesper sand
  anchor, removed lines `--err` rose — no new color system. Binary files show
  "Binary files differ".
- **Refresh**: poll `GET /api/git/status` every ~3 s while a project with a
  repo is open, plus an event-driven bump after in-app file writes (new
  `onFileWritten` pub/sub emitted from the editor save chain — `onFileSaved`
  is auto-compile-only and not reused). Polling per #32; no fs watching.
- **Backend**: extends the minimal `git.py` from #43 in place (init/commit
  kept for the FillStructureModal flow, which must keep working — commit
  defaults to include-all when the field is absent). Porcelain v2 parsing was
  verified empirically against this machine's git: type-1 lines carry mode/
  hash fields before the path (path = last token), type-2 rename paths are
  TAB-separated, and "no change" is `.` rather than a space. Commits always
  use the `_identity_args` fallback so machines without a git identity can
  still commit.

Verification plan: backend smoke suite against a temp fixture repo (status
badges incl. rename/untracked-dir, log refs + pagination + body round-trip,
commit-info numstat incl. binary and rename `from`, file diff, stage/unstage/
discard across all entry kinds, branch list/switch/create, detached checkout,
non-repo degradation) — passing. Then CDP against the web app on a fixture
project: UI state vs `git status --porcelain`, commit from UI, diff view vs
`git show`, branch switch updates header + tree.

## Resolution (September 2026)

Shipped as a sidebar module ("Git", activity bar, next to Explorer):

- **Backend** — `workbench_backend/git.py` extended in place: `workbench_status`
  (porcelain v2 + `--branch`: staged/changes with M/A/D/R badges, untracked as
  A, branch/detached/upstream/ahead-behind, remotes), `log(limit, skip)` with
  refs and relative dates, `commit_info` (numstat incl. rename/binary),
  `file_diff` / `worktree_diff` (untracked → synthesized full-add), `stage` /
  `unstage` / `discard`, `branches` (skips git's `(HEAD detached at …)` pseudo-
  line, which otherwise surfaces as a phantom branch), `switch_branch`
  (show-ref verify; dirty refusal → 409 with git's message) and
  `checkout_commit` (`git switch --detach`). Routes in `app.py`: POST
  `init|commit|stage|unstage|discard|branch|switch|checkout`, GET
  `status|log|commit-info|diff|worktree-diff|branches`. Issue-43 flow kept:
  `POST /api/git/init` still does init + baseline commit by default; a new
  `commit: false` body flag (used only by the Git module's empty state) runs
  plain `git init` with no baseline commit, so the UI can offer making the
  first commit via the commit box, per spec.
- **Web** — `components/GitPane.tsx`: Changes view (branch header + detached
  marker + short sha, ahead/behind chip, remotes; Staged/Changes groups with
  hover row actions Stage / Unstage / Discard(confirm) / Open diff(HEAD vs
  worktree) / open in editor), commit box (message + Commit staged set,
  "include all changes" toggle default off, disabled while empty); History tab
  (newest-first rows: short hash mono, author, relative date, refs badges,
  expandable message; click → per-file numstat + unified diff, binary-aware;
  Checkout with confirm; bounded 50 + load-more via `skip`); branch picker in
  the header (local branches, switch with confirm on dirty, "New branch…",
  remotes shown as labels — fetch/push/pull out of v0). Empty states:
  not-a-repo → Initialize (+ first-commit offer after), missing git binary →
  install hint. Refresh: ~3 s poll while a repo is open (per #32, no fs
  watching) + `onFileWritten` bump emitted from the editor save chain
  (`modules/events.ts`). Dependency-free unified-diff parser/renderer with
  line-number gutter; removed lines use U+2212.
- **Verified** — backend smoke suite against a fixture repo (passing); then
  headless Chrome CDP end-to-end on a rebuilt fixture: 43/43 checks — status
  vs `git status --porcelain`, untracked synthesized diff, staged-only diff vs
  `git diff HEAD`, commit-detail numstat (+3 −1) and commit diff vs
  `git show`, UI commit (include-all, disabled/enabled, subject + contents),
  branch switch main→draft (header + tree + draft history), detached checkout
  (short sha header, M/D unstaged rows, discard confirm + restore),
  detached→main + branch create, new-branch flow, bounded 50 → load-more to
  64 surviving a poll, and the not-a-repo empty state → plain init → first
  commit from the UI on an unborn HEAD. `tsc --noEmit` + production build clean.
