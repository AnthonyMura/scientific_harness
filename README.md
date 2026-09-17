# Scientific Writing Workbench

A lab workstation for publication preparation — one client that unifies scientific writing, references, student data, compilation, research search, and LLM assistance. Full conception: [docs/technical_description_v3.md](docs/technical_description_v3.md).

## Status

Building. The v0 core is implemented in [`workbench/`](workbench/) (browser-first dev mode; the Electron shell comes later): file explorer with full VSCode-style file operations, CodeMirror editor, a recursive split-tree layout (VSCode-style splittable panes), embedded PDF viewer with SyncTeX, streaming log panel with clickable errors — and an **in-app TinyTeX**: a hidden TeX Live inside the app folder (`workbench/.texlive`) that the app installs, updates and extends on demand, so no system TeX is required. All milestones M0–M4 are implemented (ssh compile target included); remaining work is final polish. The editor cursor is palette-styled and user-configurable from its gear menu, and compiling opens the PDF pane to the right of the active editor. The LaTeX controls live where the work happens: Compile (with a "what to compile" picker) sits in the editor header for .tex files, an Overleaf-style project settings menu (main file chosen from the file list, compile target, auto-compile) opens from a gear next to the project name, and the PDF pane persists its output into the project via Save version / Save As, and Compile saves open editor edits before building (an unsaved change is never compiled away). The editor autosaves about a second after typing stops, and closing a tab or the window flushes whatever is still pending, so edits are never lost to a closed tab or window. Opening a project now shows only the Explorer — files land in the editor when picked from the tree. ` .tex` files get an Overleaf-style autocomplete overlay: typing `\be` suggests `\begin`, picking it opens an environment-name picker whose selection inserts the full paired block with the caret on the middle line, and `\end` lists still-open environments first; selection works with mouse click, arrows + Enter, or Tab. No LLM, no Zotero, and no block IDs in this slice. See [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md).

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

Public on GitHub: <https://github.com/AnthonyMura/scientific_harness>. Clone on a new machine (e.g., the office PC):

    git clone https://github.com/AnthonyMura/scientific_harness.git
    cd scientific_harness/workbench/web && npm install
    cd ../backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

Node in WSL must be >= 20 (the distro's can be older - install into `~/nodejs`, see AGENTS.md).

Dev mode: start the sidecar (`workbench/backend`: `WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765`) and the Vite UI (`workbench/web`, port 5199). The in-app TinyTeX under `workbench/.texlive` is gitignored — it installs itself from the app's Install panel on first use.