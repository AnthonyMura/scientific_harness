# 26 — PDF citation jump: click a citation → its reference entry + back button

Status: resolved (2026-09-18, branch `feature/pdf-citation-jump` off `main`)

## Request

The user wants the PDF viewer's citations — currently plain numbers like `[3]`
in the rendered page — to be clickable: a click moves the view to the citation
list (the References section of the same PDF) at that reference's entry, and an
overlay button returns the user to the exact text position they clicked from.

Note on "different colour": citations already stand out via the editor's
gold-bright `\citep` keys (issue 25). The compiled PDF itself renders citation
numbers in plain black; this ticket makes those numbers interactive in the PDF
pane.

## Scope

- Both view modes of the PDF pane: compiled output and static project files —
  both render the pdf.js text layer, so detection works identically.
- Numbered citation styles only: `[1]`, `[2,3]`, `[4–6]` (comma groups and
  ranges; dash variants `-`/`–`/`—`). Optional refinement: bare `(n)` accepted
  only when `n` falls inside the detected entry range (guards against years
  like "(2023)").
- Author-year styles ("Smith (2023)") are out of scope for v0.
- No backend changes; no new API endpoints.

## Current state (verified in code)

- `workbench/web/src/components/PdfViewer.tsx` renders each page as a `.pdf-page`
  wrapper: canvas + pdf.js `TextLayer` (transparent spans, one per text item,
  positioned by % of page dimensions; zoom rides on the `--scale-factor` CSS var).
- Clicking anywhere on a page runs inverse search (host `onClick`, drag-suppressed
  via pointer-down distance) → jumps to the source line in the editor.
- `.pdf-sync-flash` (sand box, fade animation) already exists for forward-search
  highlighting and is reused for both ends of the jump.
- `layer.textDivs` is a public getter on pdf.js's TextLayer: one span per text
  item in stream order — the scan pass reads boxes from these spans.

## Design

### 1. New module `web/src/modules/pdfCitations.ts`

Pure + DOM-scan helpers (no React):

- Types:
  - `interface Box { x0, y0, x1, y1 }` — page-local CSS px at the current zoom.
  - `interface CiteGroup { numbers: number[]; box: Box; subBoxes: Box[] }` — one
    per detected `[…]` group; `subBoxes[i]` covers the i-th number/range so a
    click inside `[2,3]` can target the digit under the cursor.
  - `interface LineItem { text: string; x0, yTop, x1 }` — one visual line.
  - `interface BibEntry { page: number; xPx, yTopPx: number; lines: string[] }`.
- `scanPage(pageDiv, layer): { groups: CiteGroup[]; lines: LineItem[] }`
  1. For each span in `layer.textDivs`: rect = span.getBoundingClientRect() −
     pageDiv.getBoundingClientRect() → page-local box + text. (Spans are laid
     out by then; the pass runs right after `layer.render()` resolves.)
  2. Group spans into visual lines: sort by y-center, merge while vertical
     distance < ~4px; concatenate text with per-character span provenance.
     Normalize dashes (`–`/`—` → `-`) before matching.
  3. Match citation groups with
     `/\[\s*(\d{1,4}(?:\s*-\s*\d{1,4})?)(?:\s*,\s*(\d{1,4}(?:\s*-\s*\d{1,4})?))*\s*\]/g`
     over each line's concatenated text; expand ranges (`[4-6]` → 4,5,6).
     Reject bracketed content that is not a clean number list (e.g. `[1a]`).
     Groups never span lines.
  4. Create one marker per group: `<span class="pdf-cite" data-cite="2,3">`,
     absolutely positioned inside `.pdf-page` over the union box of the matched
     characters (1px padding), transparent, `cursor: pointer`. Markers are
     appended after the text layer, so they sit above it and intercept pointer
     events on the cited glyphs (text selection starting exactly on a citation
     is sacrificed — by design, the citations are interactive).
- `scanBibliography(pages: LineItem[][]): Map<number, BibEntry>`
  - Find the section: first line matching `/^\s*(references|bibliography)\b/i`.
  - After it, an entry starts at a line beginning with `[N]` (v0: bracketed
    form only) whose x is in the left half of the page width (two-column guard).
  - Entry text = all following lines until the next entry start; entries may
    span pages. No heading found → empty map, feature stays inert (no error).

### 2. Wiring in `PdfViewer.tsx`

- Render effect: after each page's `await layer.render()`, call `scanPage` and
  accumulate groups + lines into refs (`citeIndexRef`, `pageLinesRef`); after
  the last page, run `scanBibliography` → `bibIndexRef`. Markers live inside
  `.pdf-page`, so the existing `host.innerHTML = ""` on re-render clears them;
  refs are rebuilt each pass.
- Host `onClick` (existing handler, after drag suppression): hit-test the
  click's page-local point against `citeIndexRef` groups. On a hit:
  - Pick the target number: the sub-box containing the point's x (else first).
  - Look up `bibIndex.get(n)`. Found → set back state `{ page, xPx, yPx, label }`
    from the clicked group's box, smooth-scroll the host to the entry
    (vertically centered; left edge at ~80px like forward search), flash the
    entry line with `.pdf-sync-flash` sized to the first entry line's extent,
    and return — inverse search is suppressed for this click.
  - Not found → fall through to normal inverse search.
- Back button: React state `backTarget` rendered as a floating pill inside
  `.pdf-pane` (top-left, below the header): `← back to [3] · p. 2` + ✕.
  - Click body → smooth-scroll back to the saved citation box (centered), flash
    it, clear state.
  - Dismiss: ✕, Escape (window keydown while set), a new citation jump, or any
    re-render (zoom / mode switch / new compile clears it in the render effect).

### 3. Styles (`styles.css`, PDF section)

- `.pdf-pane { position: relative }` (anchor for the pill; no other effect).
- `.pdf-cite`: absolute, transparent, `cursor: pointer`; hover → sand tint
  `rgba(179,143,111,.20)` background + radius-sm, 120ms transition. Sand is the
  token for links per app_design_guide §4; gold-bright stays editor-only.
- `.pdf-back-pill`: raised bg, strong hairline, radius-sm, Inter 10px uppercase
  (mini-button vocabulary), top-left of the pane at 12px inset, z above pages.

## Implementation steps (one commit each)

1. **Plan** — this ticket. `docs(scratch): issue 26 — pdf citation jump (plan)`
2. **Module** — `web/src/modules/pdfCitations.ts`: line grouping, group regex +
   range expansion, marker creation, bibliography index.
   `module(pdf-viewer): citation index over the pdf text layer`
3. **Wiring** — PdfViewer: post-render scan pass, click hit-test → jump + flash,
   back pill (state, JSX, Escape handler, re-render clear).
   `module(pdf-viewer): click a citation to jump to its reference entry, with a back button`
4. **Styles** — `.pdf-cite`, `.pdf-back-pill`, `.pdf-pane` position.
   `module(pdf-viewer): styles for citation markers and the back pill`
5. **Docs** — README status line; workbench_v0_plan.md progress note;
   app_design_guide.md §3.7 (citation markers + back pill); ticket verification
   + resolved status. `docs(readme)`, `docs(workbench)`, `docs(theme)`, `docs(scratch)`

## Verification

- **Node harness** (Node 22, `--experimental-strip-types`, real module import):
  - Line grouping + regex: synthetic span sets → correct groups/numbers/boxes;
    `[1]`, `[2,3]`, `[4–6]` (all dash variants); one group wrapped across two
    lines is not matched; `[1a]` and `(2023)` are not matched.
  - Bibliography index: synthetic pages with a References heading → entry map
    with correct page/y; no heading → empty; right-column line starts ignored.
- `tsc --noEmit` + `vite build` clean (WSL).
- **UI (headless Chrome CDP, per AGENTS.md)**: fixture — add
  `test-latex-project/cite-demo/` (main.tex: natbib `numbers` style, 4 `\citep`s
  in the body, References via `refs.bib` with 4 entries). Open the project,
  compile, then drive CDP:
  - `.pdf-cite` markers exist; count matches the citation groups.
  - Real click on a marker → host scrolls to the references page region; back
    pill visible with the right label/page.
  - Click the pill → scroll returns to the body position; flash element appears.
  - Escape dismisses the pill; clicking plain text still runs inverse search.

### Results (2026-09-18)

- Node harness (`workbench/web/verify/pdf-citations.mjs`): **32/32 passing** — line grouping, all dash variants, range expansion (cap 50), non-citation brackets rejected, groups wrapped across lines not matched, bibliography index (heading variants, page-spanning entries, two-column guard), `bibStartLines` heading detection.
- `tsc --noEmit` + `vite build` clean (WSL).
- Headless Chrome CDP (`test-latex-project/cdp_citation_test.mjs`) against the natbib fixture: **11/11 passing** — exactly one PDF pane; four body markers `[4] [1,3] [2] [4,1,3]` (plainnat sorts the bibliography alphabetically and keeps argument order in multi-cites, so the body groups are not sequential); click scrolls to the entry with the back pill `← back to [2] · p. 1`; back restores the exact clicked scroll position; sand flash on the citation page; a second jump on the same marker works; Escape dismisses; a plain-text click inverse-searches (the whole cited sentence is selected in the editor); no pill for plain clicks.

## Coordination with issue 27 (hover tooltip)

This ticket owns `modules/pdfCitations.ts` and the `.pdf-cite` markers — 27's
tooltip attaches to them. Recommended order: **26 first**, then 27's geometry
step shrinks to marker-based mouseover handling. If 27 lands first, see its
coordination note (its local scan is dropped on merge).

## Comments

(created from the user request; implementation starts after plan acceptance)

Implementation notes (2026-09-18):
- `BibEntry` gained two fields beyond the ticket's interface — `x1Px` (first-line extent, sizes the flash box) and `lineHpx` (vertical centering) — a minimal extension of the same shape.
- The module exports one helper beyond the ticket's list: `bibStartLines(pages)` — per-page index of the References heading line (0 for later pages, -1 when absent). The viewer uses it to unmark `[N]` groups on/after the heading so bibliography entry labels are never rendered as clickable citations.
- The back pill restores the exact clicked position: the original `scrollLeft` is saved with the target and restored verbatim (a recomputed offset drifts once the page has scrolled horizontally).
