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
- In-app TinyTeX: a hidden TeX Live in `workbench/.texlive` that the app installs, updates and extends on demand; missing packages are added automatically during compile
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
- Editor preferences (cursor style, spell-check, dictionaries, line numbers, paragraph tags) live in the editor's gear menu

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
