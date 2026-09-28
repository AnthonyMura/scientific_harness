# 38 — Structure module (document outline / navigation)

Status: resolved (2026-09-20, main)

## Request (user)

A new "Structure" module that shows the document's sections, subsections, etc.
It works for whichever surface is active: if the PDF viewer is active it
reflects the compiled PDF, and if a `.tex` or `.md` editor tab is active it
reflects that file. The outline must be interactive — clicking an entry moves
the user to that block (heading / paragraph). For LaTeX files it should
utilize the paragraph position tag system introduced in #30
(`S2SS3P4L128`) and show paragraph numbers etc. on each row.

## Behavior

- **Target follows focus** (same `layout.focusedGroup` mechanism that drives
  `editorFocused` in App.tsx):
  - PDF pane is the focused active tab → outline of the displayed PDF
    (compiled main.pdf or a static one).
  - Active `.tex` editor tab → outline of that file's LaTeX structure.
  - Active `.md` editor tab → outline of Markdown headings.
  - Neither applicable / no project → empty state with a hint.
- **Tree**: sections → subsections → subsubsections (→ `\paragraph` for .tex),
  collapsible, indented by level; each row shows the number/tag plus heading
  text. For LaTeX, rows carry S/SS/P tags consistent with the #30 overlay so
  the tree and the in-editor tags agree.
- **Click to jump**:
  - Editor mode → move the cursor to that line of the file (existing
    `syncToEditor` machinery).
  - PDF mode → scroll the PDF to that section's page.
- **Live updates**: re-parse on document change (editor mode); refresh after a
  compile / when the displayed PDF changes (PDF mode).

## Implementation notes

- Register the module in `modules/defs.ts` (`MODULE_DEFS`, `MODULE_ORDER`) and
  `modules/registry.tsx` (`MODULES`). Singleton; default slot sidebar next to
  Explorer (see open questions).
- Cross-module wiring via `AppCtx` (`modules/ctx.ts`): needs `activeFile` plus
  a new "PDF pane focused" signal (derive in App.tsx like `editorFocused`,
  ~lines 465–471); jumps reuse `syncToEditor` / `syncToPdf`.
- **LaTeX**: extend `latexStructure.ts` — today it only exports
  `computeParagraphTags(doc)` (line → tag map). Add a structure pass returning
  an ordered list of headings (level, S/SS number, title text, 1-based line)
  plus paragraph entries; keep the counter semantics identical to #30
  (counters reset per parent section) so both features stay in sync.
- **Markdown**: parse ATX headings (`#`–`######`) with line numbers.
- **PDF mode source**: either map each heading's source line to a PDF page via
  SyncTeX, or read the PDF outline/bookmarks (pdf.js `getOutline`). Decide at
  claim time; note static PDFs may have no `.synctex`.

## Open design questions

- Default slot: sidebar or right panel?
- Which pane "owns" the module when both a PDF and an editor are open —
  last-focused wins, with fallback to the active center tab?
- Click in PDF mode: also jump the editor (dual sync), or scroll the PDF only?
- Show `\paragraph` level by default, or sections/subsections only with a
  settings toggle?
- Show line numbers on rows?

## Related

- #30 — .tex paragraph position tags (the tag system this module displays;
  shared structure pass in `latexStructure.ts`)
- #8 — SyncTeX (jump machinery), #26/#27 — PDF citation jump/hover (existing
  cross-pane jump UX)

## Verification plan

TBD at claim time: outline over a sample document with nested sections and
paragraphs; CDP check that clicking rows moves the editor cursor / scrolls the
PDF to the right page; re-parse on edit.


## Comments

Design questions (resolved at claim time):

- **Default slot**: sidebar, next to Explorer. Persisted layouts validate module
  references only, so adding the `structure` id is backward-compatible with old
  saved layouts.
- **Ownership when both PDF and editor are open**: last-focused pane wins
  (`layout.focusedGroup`; no fallback to the center tab). Clicking the Structure
  tab itself focuses the sidebar, which shows the empty state with a hint;
  refocusing the editor or PDF pane brings the outline back. This is the strict
  reading of "target follows focus" above.
- **Click in PDF mode**: scrolls the PDF only (no dual sync into the editor).
- **`\paragraph` rows**: shown by default, toggle `showParagraphs` hides them.
- **Line numbers on rows**: shown by default, toggle `showLineNumbers`.

Implementation decisions:

- **Shared structure pass** (`latexStructure.ts`): internal `walkRuns()` over
  blank-line-delimited runs; `computeParagraphTags` re-implemented on top of it
  and verified byte-identical to the #30 output (14 edge docs + 300 fuzz docs).
  New `computeStructure(doc)` returns ordered headings `{line, level 1–4, tag,
  title}`. Row tags: section → `S{s}`, levels 2–4 → `S{s}SS{ss}` (no P part —
  the paragraph counter was just reset by the heading). Titles are raw source
  text (backslash escapes preserved); short `[...]` args skipped; empty when no
  brace group. Known limitation inherited from #30 run semantics: headings
  written back-to-back with no blank line form one run — only the first
  advances counters and appears in the outline.
- **Markdown** (`markdownStructure.ts`, new): ATX `#`–`######` (space required
  after the hashes), fenced code blocks skipped, trailing closing hashes
  stripped; rows badged `h{level}` + line number.
- **PDF source**: pdf.js `getOutline()` rather than SyncTeX — works for compiled
  and static PDFs alike (static ones may have no `.synctex`). Structure fetches
  the same source as PdfViewer (`pdfFile` raw file, else the artifact
  `main.pdf`) and re-fetches on `pdfVersion` / `pdfFile` / project change.
  Destinations resolve to `{page, topPt}` (XYZ y is points from the page bottom).
- **Live editor content**: EditorPane registers an `EditorContentHandle`
  (live text + change subscription) in its view effect and unregisters on
  cleanup; App holds a registry keyed by file path. Structure subscribes with a
  150 ms debounce → re-parse on every edit.
- **New ctx channels** (`modules/ctx.ts`): `pdfGoto {page, topPt?, nonce}`
  consumed by PdfViewer (retry loop ≤20×250 ms while pages render; smooth scroll
  + `.pdf-sync-flash` band); `registerEditorContent` / `editorContent` /
  `subscribeEditorContent`; derived `pdfFocused` alongside `editorFocused`.
- **Workbench shell**: clicking a Structure row no longer steals pane focus
  (same exception as Explorer) — otherwise the outline would empty itself after
  every jump.

Verification (headless Chrome CDP, 14/14 checks): empty state with hint; tex
outline of 7 rows with exact S/SS tags + titles; header label "LaTeX sections";
row click moves the editor selection to the `\section{Methods}` line; markdown
outline skips fenced lines and badges levels; PDF-pane focus → "PDF bookmarks"
with page badges (hand-built 2-page XYZ-outline PDF dropped at
`.workbench/build/main.pdf`); bookmark click scrolls the PDF host (scrollTop
0→520) and the outline stays on bookmarks afterwards; collapse hides child
rows; no console errors. `tsc --noEmit` + Vite production build green.
