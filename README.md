# Scientific Writing Workbench

A lab workstation for publication preparation — one client that unifies scientific writing, references, student data, compilation, research search, and LLM assistance. Full conception: [docs/technical_description_v3.md](docs/technical_description_v3.md).

## Status

**v0.1.0 released for lab use (2026-07)** — install and run on Windows, WSL2, macOS or Linux: [docs/INSTALL.md](docs/INSTALL.md). The v0 core is implemented in [`workbench/`](workbench/) (browser-first dev mode; the Electron shell comes later): file explorer with full VSCode-style file operations, CodeMirror editor, a recursive split-tree layout (VSCode-style splittable panes), embedded PDF viewer with SyncTeX, streaming log panel with clickable errors — and an **in-app TinyTeX**: a hidden TeX Live inside the app folder (`workbench/.texlive`) that the app installs, updates and extends on demand, so no system TeX is required. All milestones M0–M4 are implemented (ssh compile target included); remaining work is final polish. The editor cursor is palette-styled and user-configurable from its gear menu, and compiling opens the PDF pane to the right of the active editor. The LaTeX controls live where the work happens: Compile (with a "what to compile" picker) sits in the editor header for .tex files, an Overleaf-style project settings menu (main file chosen from the file list, compile target, auto-compile) opens from a gear next to the project name, and the PDF pane persists its output into the project via Save version / Save As, and Compile saves open editor edits before building (an unsaved change is never compiled away). The editor autosaves about a second after typing stops, and closing a tab or the window flushes whatever is still pending, so edits are never lost to a closed tab or window. Opening a project now shows only the Explorer — files land in the editor when picked from the tree. ` .tex` files get an Overleaf-style autocomplete overlay: typing `\be` suggests `\begin`, picking it opens an environment-name picker whose selection inserts the full paired block with the caret on the middle line, and `\end` lists still-open environments first; selection works with mouse click, arrows + Enter, or Tab. The editor also spell-checks as you type — misspelled words get a brick wavy underline (LaTeX commands are skipped), with an on/off toggle and a dictionary picker for the ten most popular languages (English first, Russian second) in the gear menu; each dictionary downloads once from jsDelivr and is cached in IndexedDB. In .tex files the citation author keys — the names inside `\citep{…}` & kin — render in warm gold-bright (bone) so references stand out of the text. `.bib` files get BibTeX highlighting on the same Vesper anchors (entry type gold-bright, keys gold-bright, field names sand, comments brown italic) plus a Format action in the editor header that pretty-prints the bibliography canonically — one field per line, comments preserved, idempotent — and typing inside `\citep{…}` & kin offers the project's citation keys with author/year hints, filtered as you type and re-queried after each comma for multi-key citations, and the PDF viewer jumps from a clicked citation (`[3]`) to its reference entry — a back pill returns to the exact clicked position (`.scratch/module-workbench/issues/26-pdf-citation-jump.md`). Hovering a numbered citation shows a tooltip with the reference's title, authors and DOI (when known); group citations like [2,3] list every reference in the group (capped at six with a '… plus N more' line); the card appears once at the bottom-right of the cursor and stays put while the pointer rests on it — select/copy its text, follow DOI links — compiled output is read from the project's own `.aux`/`.bib` (falling back to the generated `.bbl`, then the PDF's printed References text), while static files parse the PDF's own References section (`.scratch/module-workbench/issues/27-pdf-citation-hover.md`). .tex files also show paragraph position tags — above the first line of each text paragraph, a low-contrast taupe marker like `S1·SS1·P2·L24` with bold section / subsection / paragraph counters plus line number, and a faint tint on the tagged line; a pure overlay that never touches the document, toggleable from the editor gear menu. The editor also shows line numbers - on by default, toggleable from the gear menu - with the active line's number set off in a slightly lighter cell with a hairline separator, so the cursor is never lost. A **Structure** module (sidebar, next to Explorer) outlines the focused surface — LaTeX sections/subsections/paragraphs with #30-consistent S/SS tags, Markdown ATX headings, or the displayed PDF's bookmarks — and clicking a row jumps the editor cursor or scrolls the PDF to that block. No LLM, no Zotero, and no block IDs in this slice. See [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md).

## Documents

| Document | What it is |
|---|---|
| [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md) | **Active plan** — v0 slice: architecture, API surface, milestones M0–M4 |
| [docs/technical_description_v3.md](docs/technical_description_v3.md) | Current conception and roadmap (v3) |
| [docs/technical_description_v2.md](docs/technical_description_v2.md) | Earlier conception (v2), superseded by v3 |
| [docs/technical_description_v1_original.md](docs/technical_description_v1_original.md) | Original brainstorm, kept for reference |
| [docs/reviews/gpt-sol-pro.md](docs/reviews/gpt-sol-pro.md) | Expert review (in Russian) that shaped v3 |

## Layout

- `AGENTS.md` — environment notes for agents working in this folder
- `docs/` — conception and plan documents
- `workbench/` — the v0 app: `web/` (React + Vite UI), `backend/` (Python FastAPI sidecar), `.texlive/` (in-app TinyTeX, gitignored)
- `.scratch/` — issue tracker and specs per feature
- `external/` — reference material not part of the project (currently: a generic full-stack web app builder skill prompt, SKILL.md)
## Repository

Public on GitHub: <https://github.com/AnthonyMura/scientific_harness> — first release **v0.1.0** (tag `v0.1.0`, 2026-07). Full per-platform install & run guide: [docs/INSTALL.md](docs/INSTALL.md).

Clone on a new machine (e.g., the office PC):

    git clone https://github.com/AnthonyMura/scientific_harness.git
    cd scientific_harness/workbench/web && npm install
    cd ../backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

Node in WSL must be >= 20 (the distro's can be older - install into `~/nodejs`, see AGENTS.md).

Dev mode: start the sidecar (`workbench/backend`: `WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765`) and the Vite UI (`workbench/web`, port 5199). The in-app TinyTeX under `workbench/.texlive` is gitignored — it installs itself from the app's Install panel on first use.