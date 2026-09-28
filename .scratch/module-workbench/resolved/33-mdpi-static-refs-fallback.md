# 33 — Static-mode reference parsing misses `N.`-labeled bibliography entries (MDPI style)

Status: resolved (2026-09-28, main)

## Problem

The real project's PDF prints its references as `72. Author; Author. Title...`
(MDPI/ACS print style: bare number + dot, **no `[N]` brackets**). The bibliography
index in `web/src/modules/pdfCitations.ts` — shared by issue 26 (citation jump)
and issue 27's static-mode raw fallback — matches entries via bracketed `[N]`
labels and heading heuristics. For this format it detects **zero** entries:

- Static mode: the tooltip has no raw entry text to show → hovering a citation
  in a static MDPI-style PDF shows nothing.
- Issue 26: clicking a citation in such a static PDF cannot jump (no index).

## Scope of impact

Compiled mode is unaffected — it reads the project's own `.aux`/`.bib` and was
verified end-to-end on the real project (see issue 32). Only PDFs opened as
static files whose bibliography style uses `N.` labels are affected. The
real project's compiled main.pdf is exactly such a file if saved into the
project (Save version / Save As) and re-opened statically.

## Fix direction

- Extend the entry detection in `pdfCitations.ts` to accept a line-leading
  `\d{1,3}\.\s` label, guarded against prose false positives (decimals, "e.g.",
  numbered lists): e.g. require consecutive labels to increment by 1, and/or an
  author-initial pattern after the dot.
- The index is consumed by both issue 26's jump and issue 27's static fallback —
  one fix serves both.
- Extend the Node harness (`workbench/web/verify/`) with an MDPI-style fixture
  (plain text, `72.` labels) covering: entry detection, number→line mapping,
  false-positive rejection on prose lines.

## Verification plan

Save a copy of the real project's compiled main.pdf into the project (Save As),
open it statically in the PDF pane: hover a citation → tooltip shows the raw
`72.`-labeled entry text; click a citation → jumps to its entry, back pill
returns. Node harness green on the MDPI fixture.

## Comments

(defined during issue-32 real-project diagnosis; not yet implemented)

**Implemented 2026-09-28.** Two additions to `web/src/modules/pdfCitations.ts`:

1. **Bare `N.` labels (the ticket's core ask).** Entry detection now accepts a
   line-leading `\d{1,4}\.\s` label (`BARE_ENTRY_RE`) in addition to the
   bracketed `[N]` form — MDPI/ACS print style. Guarded against prose false
   positives: a bare label is only accepted when it continues an incrementing
   number sequence (`1., 2., 3., …`) that reaches `MIN_FALLBACK_ENTRIES` (8)
   entries, sits in the left half of the page width (two-column guard), and its
   first line has at least `MIN_FALLBACK_ENTRY_CHARS` (30) characters — a real
   reference's first line is an author/title line, while the other bare "N."
   lines in such documents are short section titles ("2. Materials and
   Methods") or prose.

2. **Heading-less fallback.** The real MDPI build renders its references with
   an empty `\section{}` (mdpi.cls leaves `@reftitle` unset), so the PDF has no
   "References" heading text at all — the heading path of `findBibStart` finds
   nothing. It now falls back to the validated bare-label entry above when no
   heading exists anywhere in the document. Among passing candidates the LAST
   one wins: prose numbered lists sit mid-document, a bibliography at the end.

**Verification.**

- Node harness (`workbench/web/verify/pdf-citations.mjs`, run with
  `node --experimental-strip-types`): **47/47**, including the new MDPI-style
  fixture — bare-label detection, number→line mapping, incrementing-sequence
  guard (rejects a lone "1." in prose), section-title false-positive rejection,
  two-column guard, and last-candidate-wins.
- **Real-PDF CDP E2E** (headless Chromium :9333 against the live app at :5199,
  sidecar on the real manuscript project): opened the actual compiled
  `build/main.pdf` (20 pp; references start p.15 with 95 bare-labeled entries
   and no heading) statically — **11/11 checks**:
  - 96 in-text citation markers rendered, incl. mixed-spacing group `[53, 54 ]`;
  - hover [50] → tooltip shows the raw "WHO Laboratory Manual" entry text, with
    no structured title/authors/doi (static-mode fallback, as designed);
  - click [94] → sync flash + host scrolls to the Workentine entry;
  - re-hover [94] after the jump → raw Workentine text.

**Residual risks** (documented in code comments): a prose numbered list of ≥8
consecutive items at the end of a document could false-positive; a very short
reference section (<8 entries) would not be indexed by the fallback; an
appendix with its own "1."-numbered list after the bibliography would win over
the real one. All three are rare in practice and would degrade gracefully (a
tooltip showing slightly wrong raw text / a jump to the wrong page), never a
crash or mis-render.
