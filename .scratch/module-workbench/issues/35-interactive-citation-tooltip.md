# 35 — Interactive citation tooltip: DOI links and selectable text

Status: resolved (implemented and verified on the real project)

## Request

User: push the hover tooltip further — make the overlay interactive, render the
DOI as a URL when possible, and allow selecting/copying any part of the card's
text while the mouse is over it.

## Design

- **Interactive card**: `.pdf-cite-tip` switches from `pointer-events: none` to
  `auto` with `user-select: text`, so the pointer can rest on it — native
  selection + Ctrl+C, and links are clickable.
- **Grace bridge** (the tricky part): the card is a sibling of the PDF host in
  `.pdf-pane`, so leaving the marker used to hide it before the pointer could
  reach it. `PdfViewer.tsx` now schedules a 200 ms hide instead of hiding
  immediately when the pointer leaves the marker (or the card); entering the
  other element cancels the pending hide. Crossing the gap keeps the card
  alive; genuinely leaving hides it after 200 ms. Scroll / click / re-render
  still hide at once.
- **DOI links**: in `fillTip`, a DOI matching `^10\.\d{4,9}/\S+$` renders as
  `<a href="https://doi.org/<doi>" target="_blank" rel="noreferrer noopener">`;
  anything else stays plain text ("if possible").

## Verification (real project, CDP + real mouse events)

1. `[3,4,5]` tooltip: 3 entries, each DOI line a proper anchor
   (`https://doi.org/…`, `target=_blank`).
2. Pointer moved onto the card, held 700 ms (> grace window): still visible.
3. Real drag-selection inside the card selected "nfertility in 204 countries
   and territories between" (part of Huang's title) — `window.getSelection()`
   non-empty.
4. Clicking the first DOI anchor opened a new tab at
   `https://doi.org/10.1186/s12889-023-16793-3` (observed via CDP target list).
5. Leaving marker and card: hidden after the grace period.
6. Single-marker regression `[7]`: one entry, unchanged behavior.

`tsc --noEmit` + production build green.

## Comments

(created and resolved in the same session from the user request)
