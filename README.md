# Scientific Writing Workbench

A lab workstation for publication preparation. One client unifies scientific writing, references, student data, compilation, research search, and LLM assistance. Full conception: [docs/technical_description_v3.md](docs/technical_description_v3.md).

## Release

**v0.1.0** (2026-07) is the first lab release, tagged `v0.1.0`. Install and run on Windows, WSL2, macOS, or Linux: [docs/INSTALL.md](docs/INSTALL.md).

## Quick start

Requirements: Git, Node 20+ (LTS), Python 3.11+. Distro Node packages are often too old; see the per-platform notes in [docs/INSTALL.md](docs/INSTALL.md).

```bash
git clone https://github.com/AnthonyMura/scientific_harness.git
cd scientific_harness/workbench/web && npm install
cd ../backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```

Start the sidecar and the UI in two terminals:

```bash
# terminal 1, from workbench/backend
WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765

# terminal 2, from workbench/web
npm run dev
```

Open http://127.0.0.1:5199 and open a project (or create one from the built-in template). The in-app TinyTeX under `workbench/.texlive` is gitignored; it installs itself from the app's Install panel on first use, so no system TeX is required.

## Status

The v0 core is complete: milestones M0-M4 implemented (ssh compile target included), remaining work is final polish. The app runs in browser-first dev mode (`workbench/`); the Electron shell comes later.

Implemented in this slice:

- File explorer with full VSCode-style file operations; opening a project shows only the Explorer, and files land in the editor when picked from the tree
- CodeMirror editor inside a recursive split-tree layout (VSCode-style splittable panes)
- Embedded PDF viewer with SyncTeX; compiling opens the PDF pane to the right of the active editor
- Streaming log panel with clickable errors
- In-app TinyTeX: a hidden TeX Live in `workbench/.texlive` that the app installs, updates and extends on demand; missing packages are added automatically during compile — including whole language toolchains (e.g. Russian: T2A Cyrillic encoding, babel + hyphenation, LH font sources), with a one-shot fallback to the official CTAN mirror when the primary mirror ships a partial package
- Compile (with a "what to compile" picker) in the editor header for .tex files; an Overleaf-style project settings menu (main file from the file list, compile target, auto-compile) opens from a gear next to the project name
- PDF pane persists output into the project via Save version / Save As; Compile saves open editor edits before building, so an unsaved change is never compiled away
- Autosave about a second after typing stops; closing a tab or the window flushes whatever is still pending
- LaTeX autocomplete: typing `\be` suggests `\begin`; picking an environment inserts the full paired block with the caret on the middle line; `\end` lists still-open environments first (mouse, arrows + Enter, or Tab)
- Live spell-check with a brick wavy underline (LaTeX commands skipped), an on/off toggle, and a dictionary picker for the ten most popular languages (English first, Russian second); each dictionary downloads once from jsDelivr and is cached in IndexedDB
- Citation keys inside `\citep{...}` and kin render highlighted so references stand out of the text; .bib files get BibTeX highlighting plus a Format action that pretty-prints the bibliography canonically (one field per line, comments preserved, idempotent)
- Typing inside a citation command offers the project's citation keys with author/year hints, filtered as you type and re-queried after each comma for multi-key citations
- Clicking a numbered citation in the PDF jumps to its reference entry; a back pill returns to the exact clicked position
- Hovering a numbered citation shows a tooltip with the reference's title, authors and DOI (when known); group citations like [2,3] list every reference in the group (capped at six)
- Paragraph position tags above each text paragraph (a marker like `S1·SS1·P2·L24` with bold section/subsection/paragraph counters plus line number); a pure overlay that never touches the document, toggleable from the gear menu
- Line numbers on by default, toggleable; the active line's number sits in a slightly lighter cell so the cursor is never lost
- Structure module (sidebar, next to Explorer): outlines the focused surface (LaTeX sections/subsections/paragraphs with S/SS tags, Markdown ATX headings, or the displayed PDF's bookmarks); clicking a row jumps the editor cursor or scrolls the PDF
- `.tex` comment toggle: hide full-line `%` comments from view for a clean writing view — display-only (the file on disk is never touched), line numbers keep their real positions with gaps, `%` lines inside verbatim environments stay visible, and hidden lines are excluded from search while hidden (noted in the settings menu and as a header chip)
- Common text formats open with per-format highlighting: LaTeX, Markdown, BibTeX, JSON, YAML/TOML/INI config and XML/HTML (no new dependencies); .txt, .csv/.tsv and .log stay plain; 'New File…' offers each type and tree rows show a dedicated icon per format
- After any top-bar project change (Recent…, Open…, New…) the Explorer's refresh button turns red until a full tree reload succeeds — an explicit cue that the tree may be out of date and that clicking it makes sure
- The top bar's Recent… picker is a custom dropdown (replacing the native select); each row carries a hover-revealed × (always visible on touch) that removes just that history entry — the project folder on disk is untouched, and the control is hidden for the currently open project
- Editor preferences (cursor style, spell-check, dictionaries, line numbers, paragraph tags) live in the editor's gear menu
- Project templates and "Fill with structure": new projects are created from a template picker (radio cards with name, one-line description and expandable file list — `manuscript` default, `classic` alongside); existing projects can fill in the missing structure from any template via the project settings menu — non-destructive dry-run preview first, idempotent, provenance recorded; new projects get a git baseline commit, and filling a non-repo offers "Initialize repository" (never auto-inits; a missing git binary never blocks)
- Cross-reference and file autocomplete: typing `\ref{`, `\eqref{`, `\autoref{`, `\cref{`/`\Cref{`, `\vref{`/`\Vref{`, `\pageref{`, `\nameref{`/`\vnameref{` or `\hyperref{` offers the project's own labels — grouped into Figures, Tables, Equations and Sections, each with a hint (caption text, section title or a snippet of the surrounding line); after a successful compile, known numbers and pages are appended (`Fig. 3.2 · p.2`, `\eqref` shows `(3.2)`), and duplicate labels are flagged on every row; `\input{`/`\include{` offer project `.tex` files relative to the current file's directory (the current file excluded), `\bibliography{` offers `.bib` sources with a re-query after each comma, and `\includegraphics{` offers images with their size in KB
- The Open… flow is identical on every platform: a path-input modal with level-by-level autocomplete — typing a partial path lists the next level's folders at full opacity and files dimmed for context, arrows + Enter drill down (appending the trailing /), Enter opens the folder; submitting a file path shows the backend error inline in the modal
- Git module (sidebar): project state and commit history — branch header with detached-HEAD marker and short sha, ahead/behind counts, Staged/Changes groups with M/A/D/R badges, per-row Stage / Unstage / Discard (confirm) / Open diff (worktree vs HEAD) / open in editor; a commit box that commits the staged set ("include all changes" toggle off by default, disabled while the message is empty); history newest-first with short hash, author, relative date, refs and expandable message — clicking opens per-file numstat + unified diff (binary-aware), checkout to any commit (detached, confirm), 50 shown at a time with load-more; the branch picker switches local branches (confirm on dirty) and creates new ones, remotes are listed in the header (fetch/push/pull out of v0); a non-repo project shows an Initialize action (plain `git init`, then the first commit is offered via the commit box), and a missing git binary shows an install hint without blocking project work; Changes rows carry entry icons (folder icon for directories with the folder name as primary, Explorer type icons for files — directory rows keep Stage/Unstage/Discard and drop diff/editor), and repo init writes a default `.gitignore` when none exists — all git runs as system-git shell-outs from the sidecar, state polled ~3 s
- Image Preview module (panel, between PDF and Log): PNG/JPG/GIF/WebP/SVG/BMP render natively from the sidecar's raw file endpoint; TIFF decodes in the browser with utif2 — multi-page files get ‹ n/N › page navigation, a `tiff` badge, and 25–400% zoom (default 100%) from the pane header; image rows in the Explorer (single click, double click, or drag-drop) open it
- Tab reorder menu: each tab's ⋯ menu offers Move tab left / right / to start / to end within its own pane — items hide themselves at the strip edges — so a tab opened second can be made first without dragging; drag-and-drop reordering is unchanged and the new order persists with the layout
- Pinned tabs: each tab's ⋯ menu offers Pin tab / Unpin tab — a pinned tab jumps to the front of its pane's strip, renders compact with a pin icon (click it to unpin), and new tabs open behind the pinned prefix; dragging a pinned tab into the unpinned region (or an unpinned one into the pinned prefix) unpins it, PyCharm-style; the pinned set and their order persist with the layout
- Per-project compile approach choice: the project settings menu offers Auto / In-app TinyTeX / System TeX / WSL (Windows hosts) / SSH — `tinytex` and `system` are first-class targets, `local` stays a backward-compatible composite alias (TinyTeX first), each option's tooltip shows its live status from the install probe, and a warning chip opens the Install panel; on-demand package repair at compile applies only to TinyTeX-backed engines

Not in this slice: LLM, Zotero, block IDs. Plan and milestones: [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md).

## Documents

| Document | What it is |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Install and run on Windows, WSL2, macOS, Linux |
| [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md) | Active plan: v0 slice architecture, API surface, milestones M0-M4 |
| [docs/technical_description_v3.md](docs/technical_description_v3.md) | Current conception and roadmap (v3) |
| [docs/technical_description_v2.md](docs/technical_description_v2.md) | Earlier conception (v2), superseded by v3 |
| [docs/technical_description_v1_original.md](docs/technical_description_v1_original.md) | Original brainstorm, kept for reference |
| [docs/reviews/gpt-sol-pro.md](docs/reviews/gpt-sol-pro.md) | Expert review (in Russian) that shaped v3 |

## Layout

- `AGENTS.md`: environment notes for agents working in this folder
- `docs/`: conception and plan documents, install guide
- `workbench/`: the v0 app. `web/` (React + Vite UI), `backend/` (Python FastAPI sidecar), `.texlive/` (in-app TinyTeX, gitignored)
- `.scratch/`: issue tracker and specs per feature
- `external/`: reference material not part of the project

## Repository

Public on GitHub: https://github.com/AnthonyMura/scientific_harness (first release tag `v0.1.0`).
