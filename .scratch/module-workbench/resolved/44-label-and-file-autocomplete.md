# 44 — Label & file autocomplete (\ref{…}, \input{…}, …)

Status: resolved (2026-09-30)
Module: editor
Related: resolved 23 (command/environment autocomplete), 29 (citation-key
autocomplete). This ticket extends the same overlay to **project-local targets**:
labels defined in the project's own `.tex` files, and the project's files
themselves.

## Request

User request (2026-09): when the user needs to mention something that lives in
the project — a file (`\input`, `\include`), or an existing table / figure /
equation / section label (`\ref`, …) — the editor should autocomplete the
command's argument with a list of candidates, instead of making the user
remember keys and paths. This ticket expands that idea to all variants: every
command that takes a project-local target as an argument, every kind of label,
and the index data each candidate row should carry.

## Scope — variant matrix

### A. Cross-reference commands (label-argument commands)

All of these take a label key and must complete against the same label index:

| Command | Notes |
|---|---|
| `\ref{}` | baseline |
| `\eqref{}` | equation labels; hint should prefer the equation number when known |
| `\autoref{}` | cleveref-style auto "Figure 3.2" wording |
| `\cref{}`, `\Cref{}` | cleveref variants |
| `\vref{}`, `\Vref{}` | verbose references |
| `\pageref{}` | page hint only |
| `\nameref{}`, `\vnameref{}` | name text |
| `\hyperref[label]{text}` | **two arguments**: complete the first against labels, then insert `{}` for the second argument with the caret inside |

One `matchBefore` branch (REF_ARG_RE) covers the whole set; only the hint
formatting differs per command. Starred/optional-argument forms are tolerated
the same way CITE_ARG_RE tolerates `[prenote]`.

### B. The label index (what a candidate row is)

- **Source**: parse `\label{key}` from **every** `.tex` file in the project via
  the existing `GET /api/files/tex` walk + per-file `readFile` — not just the
  open file (multi-file documents are the norm: `main.tex` + `\input`-ed
  subfiles).
- **Per-label metadata** (computed at index time):
  - enclosing environment type → badge: figure / table / equation (incl.
    align, gather, equation) / section heading / other;
  - caption text: nearest `\caption{…}` in the same environment, else the
    nearest section title, else a short snippet of surrounding lines;
  - file + line number (for a future jump-to-label affordance).
- **Post-compile enrichment**: after a build, parse the project's `.aux` for
  `\newlabel{key}{{3.2}{2}}` → real number and page. When the aux is present
  and newer than the source files, rows show `Fig. 3.2 · p.2` instead of raw
  caption text; otherwise fall back to the caption snippet. The in-app TinyTeX
  compile already produces aux files — no new build machinery needed.
- **Duplicate labels**: LaTeX silently picks one definition. Flag duplicates in
  the list (warning glyph on both rows) so collisions are visible.

### C. File-reference commands

| Command | Candidates | Notes |
|---|---|---|
| `\input{}`, `\include{}` | project `.tex` files | paths **relative to the current file's directory** (LaTeX resolution semantics); exclude or mark the current file itself |
| `\bibliography{}` | project `.bib` files | comma-separated multi-file: same comma-requery flow as cite keys (ticket 29) |
| `\includegraphics{}` | project images (`.png .jpg .jpeg .pdf .svg .eps`) | relative paths; detail line may carry the size in KB |

Explicitly deferred (recorded, not v0): `\subfile{}`, `\import{dir}{file}`
(import package), and completing arbitrary macro arguments that happen to be
file paths.

### D. Reverse direction — label *name* suggestions (v1 candidate)

When typing `\label{` inside a figure/table environment, suggest generated keys
derived from the caption words (`fig:apparatus-setup`) with a uniqueness check
against the index (suffix on collision). Recorded as a variant to consider;
out of v0 scope unless cheap.

### E. Behavior & edge cases

- Overlay opens only when the relevant index is non-empty; otherwise normal
  command completion proceeds (same rule as ticket 29).
- Overlay stays open while typing inside the braces (`validFor`); arbitrary
  keys/paths remain typeable — the list suggests, never blocks.
- Refresh triggers: project open; after every `.tex` save (labels and paths
  change); after a successful compile (aux numbers change). Debounced, with the
  monotonic seq-token guard from `bibIndex.ts`.
- v0 boundary (same as ticket 29): `.tex` files only — no `.sty`/`.cls`, no
  markdown (markdown cross-references are link syntax, a different feature).

## Design notes

- New `web/src/labelIndex.ts` singleton mirroring the `bibIndex.ts` pattern
  (seq token, project-open load, force-refresh hooks); file/image listings can
  live in the same index or a small sibling.
- `web/src/latexCompletions.ts`: new `matchBefore` branches — REF_ARG_RE for
  the crossref set, FILE_ARG_RE for input/include/bibliography/includegraphics.
  Sections: **Labels** (subgrouped Figures / Tables / Equations / Sections),
  **Files**, **Images**, **Bib files**.
- Backend: likely nothing new — reuse `GET /api/files/tex` + `readFile`; the
  aux file is read through the existing `readFile`. If image enumeration needs
  its own endpoint, add `GET /api/files/images` mirroring the `tex_files` /
  `bib_files` walks in `files.py`.
- `web/src/components/EditorPane.tsx`: wire refresh triggers (save already
  refreshes the bib index; compile success is already observable for the log
  panel).

## Verification plan

- `tsc --noEmit` + `vite build` clean (WSL, Node 22).
- CDP suite (headless Chrome :9333, fresh user-data-dir; test project with
  `main.tex` + `\input{sub.tex}`, a figure/table/equation each carrying a label
  in both files, an `images/` dir with a `.png`, and `refs.bib`):
  - [x] `\ref{` → overlay lists labels from **both** files with type badges +
        caption hints; typing filters; Enter inserts the key
  - [x] `\eqref{`, `\autoref{`, `\cref{` show the same list (eqref hint is the
        equation number)
  - [x] after a compile, label hints upgrade to real numbers/pages from `.aux`
  - [x] `\input{` → lists `main.tex` / `sub.tex` with relative paths; current
        file excluded or marked
  - [x] `\includegraphics{` → lists the image with its relative path
  - [x] `\bibliography{` → lists `refs.bib`; comma re-query works
  - [x] a duplicated label appears twice, both rows flagged
  - [x] project with no labels → no overlay, normal completion proceeds

## Comments

- Created 2026-09-29 from the user request; expanded above to all command and
  index variants (A–E).
- Resolved 2026-09-30. Label index in `web/src/labelIndex.ts` (scan every
  `.tex`, kind by enclosing environment, hint = caption → section title →
  snippet; duplicate keys flagged on every row; aux enrichment via
  `\newlabel{key}{{num}{page}}` once a compile has run — event-driven
  freshness, no mtime polling). Completions in `web/src/latexCompletions.ts`:
  ref-arg commands (`\ref`, `\eqref`, `\autoref`, `\cref`, `\Cref`, `\vref`,
  `\Vref`, `\pageref`, `\nameref`, `\vnameref`, `\hyperref` — first arg
  completed, `{}` inserted for the second with the caret inside) and file-arg
  commands (`\input`/`\include` relative to the current file's directory with
  the current file excluded, `\bibliography` with comma-requery,
  `\includegraphics` with KB size from the new `GET /api/files/images`).
  Overlay opens only when the index is non-empty; stays open while typing
  inside braces. Two late fixes found by the CDP suite: (1) the bib filter
  inverted (`!isBib && f !== currentFile`) emptied every `\bibliography` list;
  (2) CodeMirror's `sortOptions` dedupes options by (label, detail), so once
  aux enrichment made both rows of a duplicate label identical one vanished —
  duplicate rows now carry their definition site (`file:line`) in the detail.
  Verified by a 44-check CDP suite (fresh Chrome :9333 against a fixture
  project with labels in two files, an image, `refs.bib`, and a duplicated
  section label): pre-compile hints, post-compile aux numbers/pages, all ten
  ref commands, file/image/bib candidates, validFor typing-filter behavior,
  hyperref insertion, and the no-labels project. Deferred as recorded: D
  (label-name suggestions) is v1; `.tex`-only index per scope.
