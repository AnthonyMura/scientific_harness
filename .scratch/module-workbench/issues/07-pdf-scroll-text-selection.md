# 07 — PDF viewer: scrolling + text selection

Status: resolved

## Scope
The PDF preview pane could not be scrolled (content was clipped) and its
text could not be selected or copied. Both are required for reading long
compiled documents in the app.

## Root cause
- `.split-child` was a plain block box, so a group inside it sized to its
  content instead of filling the slot; tall panes (PDF) overflowed and were
  clipped by `overflow: hidden`, leaving no scrollable element anywhere.
- The viewer rendered each page as a bare canvas with `max-width: 100%`:
  zoom had no visible effect, and there was no text layer to select from.

## Implementation
- `web/src/styles.css` — `.split-child` is now a flex column and `.group`
  fills it (`flex: 1`), so every pane gets a definite height and its inner
  scroll container works (fixes the PDF, Run Log and Install panes alike).
- `web/src/components/PdfViewer.tsx` — each page renders into a `.pdf-page`
  wrapper (exactly canvas-sized via `width: max-content`, centered when
  narrow); the host scrolls in both directions. A pdf.js `TextLayer` (the
  same class the official viewer uses, exported by `pdfjs-dist`) is laid
  over each canvas from `page.streamTextContent()`, with `--scale-factor`
  set per page so glyphs align with the rendering. Text layers are
  cancelled on re-render and unmount.
- Ported the official viewer's `.textLayer` CSS (transparent absolute
  spans, `cursor: text`) under `.pdf-page .text-layer`; selection uses the
  app's Vesper `::selection` color.

## Verification
`tsc --noEmit` + `vite build` clean. Headless-Chrome CDP probe against a
13-page test project (`/home/nk/Documents/Workbench/scrolltest`):
- `.pdf-host` scrollHeight 13070 vs clientHeight 32; `scrollTop = 1234`
  sticks (before: stayed 0 while the group grew to 13139 px and was clipped).
- 1356 text-layer spans across 13 pages; layer width equals canvas width.
- Programmatic range selection over a span returns the page title text.
- Zoom in re-renders at 150% (canvas 765 → 918 px); editor pane unaffected.
