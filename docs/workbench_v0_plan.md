# Workbench v0 — Application Plan

> **Status:** building — v0 core implemented in `workbench/` (M0–M2 done, M3 in progress; see section 9). Companion to technical_description_v3.md. This is the first buildable slice of the workbench: file explorer, editor, LaTeX compiler with switchable compile targets (plus an app-local TinyTeX), PDF viewer. No LLM, no Zotero, no block IDs in this slice (block IDs are the next increment).

## 1. Purpose and definition of done

A cross-platform desktop app (Windows, macOS, Linux; WSL2 covered) that opens a project folder, shows its files, edits .tex and .md, compiles .tex against a selectable compile target, and shows the resulting PDF with source↔PDF sync.

Definition of done: create a new project from the built-in default template (or open one of your real MDPI manuscripts), pick a compile target, click compile, get the PDF inside the app; then break a line and see the error jump you to it.

## 2. Architecture overview

Three parts: an Electron shell, a React UI inside it, and a Python backend sidecar that owns all I/O.

```
+--------------------------------------------------------------+
| Electron shell (Windows / macOS / Linux)                     |
|  +--------------------------------------------------------+  |
|  | UI (React + TypeScript)                                |  |
|  |   file explorer | editor | PDF viewer | log panel      |  |
|  +--------------------------------------------------------+  |
|        HTTP on 127.0.0.1 (random port, token auth)           |
|  +--------------------------------------------------------+  |
|  | Backend sidecar (Python 3.11+, FastAPI)                |  |
|  |   projects | files | compile service | config          |  |
|  +--------------------------------------------------------+  |
|        shell spawns and supervises the sidecar               |
+--------------------------------------------------------------+
              |                 |                |
         local TeX          wsl.exe          ssh (M4)
```

- The UI never touches files or processes directly; everything goes through the backend API. The frontend stays a thin view, so every OS behaves identically.
- The backend runs where the project files live. Default deployment: bundled sidecar on the host OS. On your machine there is an alternative: run the sidecar inside WSL (files and TeX both native there) and let the Windows UI attach over localhost. Same code, different launch; decided at M0 based on the file-write check (section 8, risk 1).
- The Python backend is a deliberate choice: you know Python and can read every line of it. The sidecar pattern (local frontend + Python service) is the same shape as JupyterLab.

### Development mode (browser-first)

Development happens in the browser as the primary surface; the Electron shell is developed later. `npm run dev` in `workbench/app` starts only the Vite dev server and a shared sidecar bound to `127.0.0.1:8765` with token `devtoken`; the UI at http://127.0.0.1:5199 talks to it cross-origin (CORS is enabled on the sidecar, the token still gates every request). Opening a project in the browser uses an inline path modal plus the recent-projects list; the OS-native folder dialog exists only inside the Electron shell (`npm run dev:full`), which attaches to the same shared sidecar via `WORKBENCH_BACKEND_URL`, so both surfaces see one backend.

## 3. Backend (Python)

FastAPI + uvicorn, bound to 127.0.0.1 on an OS-assigned port; a random token travels in the request header. Electron spawns it at startup (`python -m workbench_backend serve`), reads the actual port from its first stdout line, and kills it on exit.

Service modules:

- **projects**: open/close folders, recent list, create new project from the default template. State is one JSON file in the app data directory; no database in v0.
- **files**: tree listing, read/write of text files (.tex, .md; other files are listed but not edited). Writes are in-place (open-write-close), never temp-plus-rename, because atomic rename is unsupported on some shares.
- **compile**: owns the compile targets (section 5). Runs latexmk per target, streams the log, parses errors into line + message, collects PDF and .synctex into the build directory.
- **config**: per-project settings (compile target, auto-compile toggle) and global settings (recent projects, last main file).

API surface for v0:

| Endpoint | Purpose |
|---|---|
| POST /api/projects/open | Open a folder as project |
| POST /api/projects/new | Create project from the default template |
| GET /api/files/tree, GET /api/files/read, PUT /api/files/write | Explorer and editor I/O |
| POST /api/compile/start, GET /api/compile/status/{id}, POST /api/compile/cancel/{id} | Compile lifecycle with log streaming |
| GET /api/artifacts/pdf | Serve the compiled PDF to the viewer |
| GET /api/config, PUT /api/config | Settings |

## 4. Frontend modules (Electron + React)

- **File explorer** (left pane): project tree; .tex/.md open in the editor; images get a preview; PDFs open in the viewer; other files are shown with their path. A "new project" button on top.
- **Editor** (center): CodeMirror 6 with LaTeX and Markdown modes, save in place (Ctrl+S), line numbers. No promises beyond syntax highlighting.
- **PDF viewer** (right pane or tab): pdfjs rendering of the compiled PDF; SyncTeX forward from M2, reverse from M3.
- **Log panel** (bottom): compile status, streaming log, clickable error list that jumps the editor to the line.
- **Project bar**: project name, main file selector, compile target selector (section 5), compile button with cancel.

## 5. Compile targets (the branch)

One interface in the backend, four implementations; selection is per-project.

| Target | Where TeX runs | How the app reaches it | Ships |
|---|---|---|---|
| local | Same OS as the backend | Direct subprocess: MiKTeX or TeX Live on Windows, MacTeX on macOS, texlive on Linux | M1 |
| wsl | A WSL2 distro (Windows only) | `wsl.exe -d <distro> -- latexmk ...` | M1 |
| ssh | Any machine on the LAN or internet | Key-based ssh; project synced to a working directory, compiled there, PDF + synctex + log pulled back | M4 |
| docker (future) | A container with a TeX image | Same sync logic as ssh over a local socket | Later, when untrusted isolation is needed |

Notes:

- wsl is technically the same machine but a separate OS environment, so it gets its own target; that matches how you actually use it.
- Auto-detected default: local TeX if found on the host, else wsl on Windows, else an in-app install hint for that OS. Per-target prerequisites are documented in-app (what to install where).
- The interface exists from day one as code, so M4 adds an implementation, not a refactor. Your current machine uses the wsl target with projects in WSL home; a Mac user uses local with MacTeX; a lab compile server later is just another ssh target.
- Because the backend is a plain HTTP service, a later "attach from a browser on the LAN" mode (colleagues using it without installing anything) falls out of the same code. That is a future mode, not v0 scope.
- App-local TeX (implemented; supersedes the install-hint default for this machine): the app can carry its own TinyTeX in a hidden `.texlive` folder inside the app directory (`workbench/backend/workbench_backend/tinytex.py`). It is installed and updated from the Install panel without admin rights, is preferred over any system TeX once present, and grows on demand — packages named in a failed compile log are installed via tlmgr and the compile retried. System TeX is never touched by this path.

## 6. Default template

Journal template migration (applying MDPI or another journal's template to existing text) stays out of v0; it is v3's verifiable migration feature and comes later. Instead the app ships one built-in default template for new projects: an academic classic layout with a bookish serif look (Palatino-like typography, generous margins, centered title page). "New project" creates a folder with main.tex from this template plus a figures/ directory.

The full default main.tex is in appendix A so the look can be judged before building.

## 7. Scope

**In:** open a project folder; file explorer (tree, image preview, PDFs to viewer); editor for .tex and .md with save in place; compile service with local and wsl targets in v0 core and ssh target as M4; build-directory hygiene (aux files out of the source tree); log panel with clickable errors; embedded PDF viewer with SyncTeX both directions; auto-compile on save (toggleable); recent projects; new project from the default template; per-project compile target selection.

**Out (explicit):** block IDs and document map (next increment after v0); Zotero and .bib generation (v0 compiles with the .bib already in the folder); LLM, rewrite, conductor; git snapshots; student data and forms; DOCX export; journal template migration; any database; docker target.

## 8. Risks and verification items

1. **File writes over UNC** (if the sidecar runs on Windows while projects live in WSL home): verify direct in-place writes from Python on day one of M0. Fallback: run the sidecar inside WSL and attach the UI over localhost (same code, different launch).
2. **SyncTeX path mapping**: TeX sees paths in its own environment (WSL form under the wsl target, remote form under ssh); the editor shows local or UNC form. The backend normalizes all paths to one canonical form before any sync lookup; verify in M2.
3. **CodeMirror LaTeX mode quality**: fallback is plain text with line numbers; syntax highlighting is not load-bearing for v0.
4. **pdfjs and SyncTeX integration**: if off-the-shelf support is weak, forward sync can be implemented by parsing the .synctex file directly (it is plain text); verify in M2.
5. **WSL2 localhost forwarding** (only if the attached deployment is chosen): verify at M0 that the Windows UI reaches a sidecar listening inside WSL.

## 9. Milestones

- **M0 skeleton.** Electron shell, sidecar lifecycle (spawn, port discovery, shutdown), file explorer module, editor module (.tex/.md with save), new project from the default template. Acceptance: create a "classic" project, edit main.tex, save, confirm the change on disk. — **done** (browser-first dev mode stands in for the shell)
- **M1 compile.** Compile service with local and wsl targets, log panel with clickable error list, build-directory hygiene, cancel button. Acceptance: a real MDPI manuscript compiles to PDF via the chosen target; introduce a typo, the error appears, clicking it jumps to the broken line. — **done**
- **M2 PDF.** Embedded viewer loads the compiled PDF; forward SyncTeX (caret or click in source flips the PDF to that page). Acceptance: click a paragraph, the PDF lands on its page. — **done**
- **M3 polish.** Reverse SyncTeX (PDF to source), auto-compile on save, recent projects, image preview in the tree, compile target selector UI with per-target install hints. Acceptance: the full definition of done from section 1. — **in progress**
- **M4 remote.** ssh target: key-based auth, project sync up, compile on the remote machine, pull back PDF + synctex + log. Acceptance: compile a project against a machine on the LAN; artifacts appear in the app and sync works against the remote paths.

> Progress (September 2026): M0–M2 done, M3 in progress — SyncTeX both directions (`.scratch/module-workbench/issues/08-synctex.md`), auto-compile on save (`.scratch/module-workbench/issues/09-auto-compile-on-save.md`) and image preview in the tree (`.scratch/module-workbench/issues/10-image-preview-in-tree.md`) are complete; remaining M3 item: compile target selector UI with install hints. Shipped beyond the original plan: the VSCode-style split-tree layout (`.scratch/module-workbench/issues/05-vscode-style-layout.md`) and the in-app TinyTeX (`.scratch/module-workbench/issues/06-in-app-tex.md`).

## 10. Relation to v3

v3 stays the roadmap. This slice reorders Stage 0: the prototypes are folded into the real app, and stable block IDs become the next increment after v0 rather than a throwaway experiment. Two new decisions are recorded here instead of in v3: the Python backend sidecar (replacing the Node main-process design) and the compile target branch (local / wsl / ssh / future docker). A one-line status note goes into v3 when v0 ships.

## Appendix A: default template (classic)

Interpretation of "academic classic with a gothic vibe of a quantum physics book": classic book serif, not blackletter. Palatino-like faces (newpx), 12pt, generous margins, centered title page, booktabs tables. If the vibe is wrong, this file is where it gets fixed before any UI work starts.

```latex
\documentclass[12pt,a4paper]{article}

\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{newpxtext,newpxmath} % Palatino-like serif, classic book typography
\usepackage{microtype}           % refined spacing and character protrusion
\usepackage[a4paper,top=2.8cm,bottom=3.0cm,left=2.6cm,right=2.6cm]{geometry}

\usepackage{amsmath,amssymb,amsfonts}
\usepackage{graphicx}
\usepackage[font=small,labelfont=bf]{caption}
\usepackage{booktabs}            % classic rule style for tables
\usepackage[colorlinks=false,pdftitle={Manuscript}]{hyperref}

\begin{document}

\begin{titlepage}
\begin{center}
  {\LARGE Manuscript title}\\[1.2em]
  {\large Author One, Author Two}\\[0.6em]
  {\normalsize Affiliation, City, Country}\\[2.5em]
  \today
\end{center}
\end{titlepage}

\begin{abstract}
Text of the abstract goes here.
\end{abstract}

\section{Introduction}

The main text starts here.

\begin{figure}[h]
  \centering
  \includegraphics[width=0.8\linewidth]{figures/example.png}
  \caption{Example figure with its caption.}
  \label{fig:example}
\end{figure}

\bibliographystyle{plain}
\bibliography{references}

\end{document}
```

Prerequisite for the default template on a fresh TeX install: `texlive-fonts-extra` (for newpx) in addition to the usual latex packages; the in-app install hint lists it.
