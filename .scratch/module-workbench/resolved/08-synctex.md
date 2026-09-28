# 08 — SyncTeX: editor ↔ PDF both directions (M3)

Status: resolved

## Scope
The M3 acceptance criteria require two-way source↔PDF navigation: a click in
the editor jumps the PDF preview to the rendered line (forward search), and a
click on the PDF jumps the editor to the source line (inverse search).

## Implementation
- `backend/workbench_backend/app.py` — new endpoint
  `GET /api/artifacts/synctex?file=main.synctex.gz`: gunzips the compiled
  artifact from `<root>/.workbench/build/` and returns it as plain text
  (404 when absent, so sync silently disables without an artifact).
- `web/src/api.ts` — `fetchSynctex()` returning `string | null`.
- `web/src/modules/synctex.ts` (new) — parser + lookups for the TeX Live 2026
  compact `.synctex.gz` format (empirically decoded; no public spec exists):
  - Header `Input:N:<abs path>` maps record input-index → source file; paths
    are normalized (`/./` collapsed) and resolved to project-relative form,
    with TeX system files (texmf-dist) mapped to `rel: null` so inverse sync
    skips them.
  - Page groups `{N … }N`; record grammar `<type><kind>,<line>:<x>,<y>[:rest]`
    with types x/k/g/h/r as content points and `( ) [ ]` structural markers.
    Coordinates are scaled DVI points: **S = 65536 · 72.27/72 ≈ 65781.87
    units per PDF pt**, x from the left edge, y from the page top (≈ baseline,
    a few pt above it).
  - `(` markers open *visual-line* regions; their x is the visual line's left
    anchor and is used as the forward-search scroll target.
  - **Sentinel records**: when TeX flushes a paragraph buffer it emits extra
    records at the visual line's start/end carrying the *current input line*
    at flush time (e.g. `\end{document}` or the next sectioning command) — not
    text actually on that line. They appear as leading/trailing runs matching
    the enclosing `(` group's own `(kind,line)`; the parser drops them so they
    cannot win nearest-neighbor lookups. Verified against two real artifacts
    (single-file and `\input{part}` multi-file).
  - `forwardLookup(file, line)` → first rendered position in stream order
    (topmost visual line), anchored at the enclosing group's x.
  - `reverseLookup(page, xPt, yPt)` → nearest visual line by |dy| ≤ 8 pt, then
    nearest record by dx ≤ 60 pt within it (a wrapped paragraph line can hold
    several source lines side by side); returns `{file: rel, line}` or null.
- `web/src/modules/ctx.ts` — `SyncRequest {file, line, nonce}`; AppCtx gains
  `pdfSync`, `editorGoto`, `syncToPdf`, `syncToEditor`.
- `App.tsx` — owns the two request states (nonce-bumped per click) and wires
  them into the ctx.
- `EditorPane.tsx` — CodeMirror `domEventHandlers.click` on `.tex` files:
  `posAtCoords` → line number → `syncToPdf`. Inverse direction: an effect on
  `[editorGoto, filePath, viewTick]` selects the whole line, scrolls it to
  center and focuses; a jump arriving while the file is still loading is
  applied right after the view is created.
- `PdfViewer.tsx` — fetches/parses the synctex artifact keyed on
  `[projectOpen, projectRoot, pdfVersion]`. Forward: smooth-scrolls the host
  so the target line is vertically centered (x anchored ~80 px from the left)
  and flashes a `.pdf-sync-flash` box over it (1.7 s); retries while the page
  host is still filling after a fresh compile. Inverse: pointerdown-tracked
  click on a page (drags > 5 px are treated as text selection and ignored),
  converts to page-local pt via the page's `--scale-factor`, then
  `syncToEditor(file, line)`.
- `styles.css` — `.pdf-sync-flash` (sand-tinted box + fade keyframes).

## Verification
`tsc --noEmit` + `vite build` clean. Node round-trip tests against the real
compiled artifacts:
- scrolltest (13 pages): 16/16 checks — page count, file mapping, forward
  lookups for lines 5/7/9/11/52/300, inverse lookups including margin clicks,
  and the sentinel regression cases (heading line 9 must not be shadowed by
  phantom records on the paragraph above).
- synctest2 (`\input{part}`): 7/7 checks — part.tex lines resolve to
  `part.tex`, main.tex lines around the `\input` resolve correctly, topmost
  visual line wins for wrapped source lines.

Headless-Chrome CDP probe against the live app (127.0.0.1:5199, scrolltest):
- Forward: clicking editor line 7 shows the flash and scrolls the PDF so the
  "This document exists…" text sits in the viewport.
- Inverse: clicking that paragraph selects source line 7; clicking the
  "Page 1" heading selects line 9 (`\subsection{Page 1}`) — the case the
  sentinel fix was made for.

## Known v0 limitations (accepted)
- Macro text is attributed to the call site: `\title{…}` (line 4) emits no
  records of its own, so clicking line 4 does nothing while line 5
  (`\maketitle`) jumps to the title block. Standard TeX behavior; revisit if
  it proves annoying.
- Forward search anchors at the visual line's left edge (the `(` group x),
  not the first glyph — good for scrolling, slightly imprecise for flashing.
