# 38 — Structure module (document outline / navigation)

Status: open (requested 2026-09-19; not claimed, not scheduled)

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
