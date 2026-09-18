# 27 — PDF citation hover: tooltip with title, authors, DOI

Status: in progress (branch `feature/pdf-citation-hover`, from `main`)

## Request

When the user hovers the mouse over a citation in the PDF viewer, a small box
should appear showing the reference's full name (title), its DOI, and its
authors.

## Scope

- Compiled output mode: structured data (title/authors/DOI) parsed from the
  project's LaTeX sources — `.aux` + `.bib`, with fallbacks below. No backend
  changes: `api.fetchRawFile(path)` already serves any project file (50 MB cap).
- Static file mode (and any compiled-mode fallback): the reference entry text
  parsed from the PDF's own References section — authors/title as printed, DOI
  only if the bibliography style prints it.
- Numbered citation styles only (same detection rules as issue 26).
  Author-year styles out of scope for v0.

## Design

### 1. New module `web/src/modules/pdfRefs.ts` — reference data

```ts
interface RefInfo { key?: string; title?: string; authors?: string; doi?: string; raw?: string }
type RefMap = Map<number, RefInfo>
async function loadCompiledRefs(stem: string): Promise<RefMap | null>
```

Resolution chain (compiled mode; stem from `ctx.pdfArtifact.pdf` minus `.pdf`):

1. **aux** — fetch `.workbench/build/<stem>.aux` (`api.fetchRawFile` → `.text()`):
   - `\bibcite{key}{n}` with numeric n → number→key (numbered styles). A
     non-numeric second arg (author-year) is ignored.
   - Fallback: `\bibitem{key}` order → n = 1-based index.
   - `\bibdata{a,b}` → candidate bibliography names.
2. **bib** — resolve `<name>.bib` at project root and `.workbench/build/`; if
   none, shallow tree scan (`api.tree`) for `*.bib`. Parse BibTeX entries with a
   small brace-depth parser (multi-line values, `{…}` and `"…"` field values,
   comments); extract `author`, `title`, `doi` (+ `journal`, `year`). Map
   key→fields; number→info via step 1.
3. **bbl** — no .bib: parse `<name>.bbl` `\bibitem{key}{text}` (or bare
   `\bibitem{key}` + following lines) → `raw` entry text only.
4. **PDF text** — static mode or total failure: the References section parsed
   from the rendered text layer (same line parsing as issue 26's bibliography
   index) → `raw` = entry lines joined; title/authors unknown, DOI only if
   printed in the PDF.

Fetching runs once per (pdfVersion, stem) when the pane shows compiled output;
results cached in a ref; failures degrade silently (tooltip falls back to raw
text). No status chip — data absence is not an error state.

### 2. Tooltip UI in `PdfViewer.tsx`

- **Geometry**: if issue 26 has landed → attach to its `.pdf-cite` markers
  (delegated `mouseover`/`mouseout` on the host; number from `data-cite`, first
  number of the group). Otherwise (this branch standalone) → local scan: the
  same line grouping + group regex as 26 (~50 lines, kept as a helper in
  PdfViewer so it is trivially deletable on merge), per-page geometry cached in
  a ref for `mousemove` hit-testing; no DOM markers — the tooltip itself is the
  hover affordance.
- **Behavior**: pointer over a citation → 200ms timer → show; leave / scroll /
  click / zoom → hide immediately and cancel the timer; moving between adjacent
  citations updates content in place (no flicker).
- **Node**: imperative DOM element (same pattern as `.pdf-sync-flash`), single
  instance appended to `.pdf-pane`, `position: fixed` at cursor + (12, 16),
  flipped above the cursor when it would overflow the viewport bottom, clamped
  horizontally; `pointer-events: none`.
- **Content** (top → bottom):
  - title — pearl, Inter 12.5px/600, max 2 lines with ellipsis (structured) or
    the raw entry text clamped to ~4 lines (fallback);
  - authors — taupe 12px, max 2 lines;
  - `doi: …` — mono 11.5px sand, break-all, only when known.
- **Look**: `--bg-raised` background, strong hairline border, radius-md (card),
  padding 8/10, max-width 340px, `--shadow-pop`. Instant show/hide (v0 motion
  rule: no new animations).

## Implementation steps (one commit each)

1. **Plan** — this ticket. `docs(scratch): issue 27 — pdf citation hover (plan)`
2. **Refs module** — `web/src/modules/pdfRefs.ts`: aux/bib/bbl parsing + fetch
   orchestration + RefMap assembly.
   `module(pdf-viewer): reference data from aux/bib for the pdf pane`
3. **Tooltip** — PdfViewer: geometry (26's markers if present, else local scan),
   mouse handling, tooltip node + content builder.
   `module(pdf-viewer): hover tooltip on citations with title, authors and doi`
4. **Styles** — `.pdf-cite-tip`. `module(pdf-viewer): styles for the citation tooltip`
5. **Docs** — README status line; workbench_v0_plan.md progress note;
   app_design_guide.md §3.7 (tooltip part); ticket verification + resolved.
   `docs(readme)`, `docs(workbench)`, `docs(theme)`, `docs(scratch)`

## Verification

- **Node harness** (Node 22, `--experimental-strip-types`):
  - aux parsing: numeric `\bibcite{key}{n}` mapped; author-year form ignored;
    `\bibitem` order fallback; `\bibdata` names extracted.
  - BibTeX parser: multi-line values, quoted values, missing fields, `and` in
    authors, comments skipped → correct title/authors/doi per key.
  - RefMap assembly end-to-end from fixture aux+bib (numbered style).
- `tsc --noEmit` + `vite build` clean (WSL).
- **UI (headless Chrome CDP)**: same `cite-demo` fixture as issue 26 (refs.bib
  with DOIs): real mouse move onto a citation → tooltip appears within ~300ms
  containing the expected title/authors/DOI strings; leave → hidden. Static-file
  mode (Save As a copy of the compiled PDF into the project, then open it) →
  tooltip shows the raw entry text instead.

## Coordination with issue 26 (citation jump)

Recommended order: **26 first** — then step 3's geometry is marker-based
mouseover and no local scan is written. If this ticket lands first, its local
scan + geometry ref stays until 26 merges; on merge, delete the local copy and
attach the tooltip to `.pdf-cite` markers (refs module and tooltip node are
unaffected).

## Comments

(created from the user request; implementation starts after plan acceptance)
