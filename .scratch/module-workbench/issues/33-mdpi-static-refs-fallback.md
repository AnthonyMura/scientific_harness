# 33 — Static-mode reference parsing misses `N.`-labeled bibliography entries (MDPI style)

Status: open (latent — compiled mode unaffected; no user-visible failure on the real project yet)

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
