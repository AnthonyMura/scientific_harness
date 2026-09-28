# 29 — Citation-key autocomplete inside \citep{…} & kin

Status: resolved (2026-09-18, main)

## Scope

Typing `\citep{` (and the sibling cite commands) in a .tex file opens the
existing Overleaf-style completion overlay with a **References** section
listing every citation key from the project's `.bib` files, each row showing
the key plus an author/year hint (e.g. `smith2023 — Smith, John et al., 2023`).
The list filters as you type; the current key is the text after the last comma
inside the braces, so the overlay stays open while typing multiple keys and a
comma re-queries with an empty prefix.

Covered commands: `\cite`, `\citet`, `\citep`, `\citealp`, `\citealt`,
`\fullcite`; starred variants and optional `[prenote]` arguments allowed.
An empty bibliography index yields no overlay (normal completion proceeds).

## Design

- **Index** (`web/src/bibIndex.ts`) — singleton `bibIndex`: loads the project's
  `.bib` files via `api.bibFiles()` + per-file `readFile`, parses with
  `scanBibEntries` (issue 28), builds `citationHint` rows. Monotonic seq token
  guards against superseded loads; refresh on project open and force-refresh
  after every `.bib` save (EditorPane).
- **Backend** (`workbench_backend/files.py`, `app.py`) — `GET /api/files/bib`
  mirroring the existing `/api/files/tex` walk, suffix `.bib`.
- **Overlay** (`web/src/latexCompletions.ts`) — `CITE_ARG_RE` matched with
  `context.matchBefore`; on a hit inside the key argument, return the index
  entries as options in section "References", `validFor: /[a-zA-Z0-9_\-,: ]*/`.
  Command list also gains citet/citep/citealp/citealt/fullcite templates.

## Verification plan

- `tsc --noEmit` + `vite build` clean.
- CDP UI check (fresh user-data-dir, port 9333): sidecar opens a test project
  with main.tex + refs.bib; open main.tex, real mouse triple to focus, type
  `\citep{` → `.cm-tooltip-autocomplete` lists keys with hints; typing filters;
  Enter inserts the key; comma keeps the overlay for the next key.

## Comments

- Resolved 2026-09-18 (main). `tsc --noEmit` + `vite build` clean. CDP UI
  suite (headless Chrome :9333, test project with main.tex + refs.bib): the bib
  index loads on project open; cursor placed inside `\citep{}` — the overlay
  opens listing all three keys under a References section with author/year
  hints (`smith2023` — `Smith, John et al., 2023`); typing `sm` filters to
  smith2023 only; Enter inserts the key (`\citep{smith2023}`); typing `,`
  re-queries with an empty prefix and `mu` filters to mura2024 (multi-key
  flow). `GET /api/files/bib` verified live on the sidecar. Note: the
  completion `from` is the start of the current key segment (text after the
  last comma), so completing one key never clobbers previously typed keys.

