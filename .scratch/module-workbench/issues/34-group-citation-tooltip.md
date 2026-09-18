# 34 — Group citations should show every reference in the hover tooltip

Status: resolved (implemented and verified on the real project)

## Request

User report: `\citep{huang_global_2023, liu_global_2025, liang_global_2025}`
(printed as `[3,4,5]` in the manuscript) — hovering it showed only a single
reference (the group's first number). Expected: every reference of the group.

## Design

- `fillTip` in `PdfViewer.tsx` now iterates over **all** numbers of the
  marker's `data-cite` (issue 26's scan already range-expands `[4–6]` →
  `4,5,6`) and renders one `.pdf-cite-tip-entry` block per resolved reference:
  title / authors / DOI, or the raw entry text in static mode. Numbers without
  a map entry are skipped; if nothing resolves, no tooltip (unchanged).
- Cap of **six** entries plus a `… plus N more` line (`.pdf-cite-tip-more`) so a
  wide range citation cannot grow the card unboundedly — the card is
  `pointer-events: none`, so it cannot be scrolled.
- Entries are separated by a hairline (`border-top` on
  `.pdf-cite-tip-entry + .pdf-cite-tip-entry`). A single-reference tooltip is
  visually unchanged (one transparent wrapper around the same content).

## Verification (real project)

The user's exact citation `[3,4,5]` now shows three entries: Huang 2023
(doi:10.1186/s12889-023-16793-3), Liu 2025 (doi:10.1038/s41598-025-01498-x),
Liang 2025 (doi:10.1093/humrep/deae292). Single-marker regression on `[7]`:
exactly one entry, "Male infertility", unchanged. `tsc --noEmit` + production
build green.

## Comments

(created and resolved in the same session from the user report)
