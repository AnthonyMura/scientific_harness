# 55 — Image viewer module: open and view PNG, JPG, TIFF in a preview pane

Status: resolved (2026-10-04, office)
Machine: office (minkota)

## Request (user)

"ticket. I need a module that can show images like png, jpg, tiff" (m00001).

## Current state

- Ticket 10 shipped image *thumbnails* in the explorer tree and the raw-bytes
  endpoint: `GET /api/files/raw?path=...` (`workbench/web/src/api.ts::fetchFileBytes`,
  backend `files.py::raw_image`, 5 MB cap, requires a guessed `image/*` media type).
  Python's `mimetypes` already maps `.tif`/`.tiff` → `image/tiff`, so the endpoint
  serves TIFF bytes today with no backend change.
- `IMAGE_EXTS` in `workbench/web/src/icons.tsx:233` is
  `[.png, .jpg, .jpeg, .gif, .svg, .webp, .bmp]` — **TIFF is missing**, so `.tif`/`.tiff`
  rows get the generic file icon and no thumbnail attempt.
- Opening an image routes to the editor: `FileExplorer.tsx::rowClick` (line ~280)
  and `onDoubleClick` (line ~361) send everything non-PDF to `ctx.onOpenFile`, and
  drag-drop in `Workbench.tsx::onDrop` (line ~367) does the same. The editor then
  shows the "binary file" error from `files.py::read_file` (415). This is the known
  limitation recorded under ticket 10 ("double-clicking an image still routes to
  the editor").
- Browsers render PNG/JPEG/GIF/WebP/BMP/SVG natively in `<img>` but **not TIFF** —
  a TIFF needs decoding before it can be shown. The sidecar deliberately has no
  image library (ticket 10's accepted limitation), so decoding must happen
  client-side.

## Requirements

1. A new workbench module "Image Preview" (panel slot, single tab like the PDF
   pane) that displays a project image file: PNG, JPG/JPEG, and TIFF/TIF
   (the formats named in the request; the existing `IMAGE_EXTS` list is kept as
   the set of openable images).
2. Clicking an image in the explorer (single or double click, context-menu "Open",
   or drag-drop onto a pane) opens it in the Image Preview pane instead of the
   editor — mirroring how PDFs route to the PDF pane.
3. TIFF files render via a client-side decoder (utif2, pure JS, no native deps);
   multi-page TIFFs show page navigation (first page by default).
4. `.tif`/`.tiff` join `IMAGE_EXTS` so tree rows get the image icon (thumbnails
   for TIFF may fall back to the plain icon — `<img>` cannot decode them).
5. Zoom control in the pane header (like the PDF pane); images keep their natural
   pixel size at 100% and the host scrolls in both directions.

## Implementation notes

- `web/src/imageDecode.ts` (new, pure): utif2-based helpers — count IFDs/pages of
  a TIFF byte buffer, decode one page to RGBA `{width, height, rgba}`; return null
  on non-TIFF/garbage input so the UI can show an error. Node-testable (utif2 is
  pure JS).
- `web/src/components/ImageViewer.tsx` (new): fetch via existing
  `api.fetchFileBytes`; native formats → object URL `<img>`; TIFF → decode selected
  page to RGBA, draw to a canvas, export PNG blob → object URL. Header: file name,
  page selector when >1 page, zoom −/+ + gear (module setting, default 100%).
- Registration: `MODULE_DEFS`/`MODULE_ORDER` in `modules/defs.ts` (insert after
  "pdf"), entry in `modules/registry.tsx`, new `ImageIcon` in `icons.tsx`.
- App wiring: `AppCtx.imageFile: string | null` + `onOpenImage(path)` in
  `modules/ctx.ts`; state + handler in `App.tsx` (mirrors `pdfFile`/`onOpenPdf`,
  incl. dropping a deleted image in `onPathsGone`).
- Routing: `FileExplorer.tsx` rowClick/double-click/menu, `Workbench.tsx::onDrop`.
- Tests: vitest for `imageDecode.ts` (real generated TIFF bytes) + `isImageName`
  with `.tiff`; backend pytest pinning that `raw_image` serves `.tiff` as
  `image/tiff` and still rejects non-images/oversized files.
- UI verification: headless-Chrome CDP end-to-end with generated PNG/JPG/TIFF
  assets in a test project (per the merge gate).

## Open questions

- (none — scope is fixed by the request; animated-GIF first-frame behavior and
  the 5 MB preview cap are inherited from ticket 10 as-is.)

## Related

- #10 (resolved) — raw-image endpoint + tree thumbnails; this ticket closes its
  "double-click routes to editor" limitation.
- `workbench/web/src/components/FileExplorer.tsx` — open routing + ImageThumb
- `workbench/web/src/components/Workbench.tsx` — drag-drop routing
- `workbench/web/src/modules/{defs,registry,ctx}.ts(x)` — module registration

## Comments

New ticket (2026-10-04); user request quoted above. Claimed same day on the
office machine; implementation branch `feat/55-image-viewer-module`.

## Resolution (2026-10-04)

Shipped on `feat/55-image-viewer-module`, ff-merged to main:

- `web(core)` — `IMAGE_EXTS` gains `.tif`/`.tiff`; new `ImageIcon` + `entryIcon`
  routing; `imageDecode.ts` wraps utif2 (`openTiff(bytes) → {count, pageSize(n),
  decodePage(n)}`, IFDs filtered on t256/t257, null on garbage); tsconfig
  `esModuleInterop`; utif2 4.1.0 dependency. 5 vitest tests (pixel-exact RGBA,
  multi-page no-state-bleed, garbage → null, bad page → throw, no buffer aliasing).
- `module(image-viewer)` — `ImageViewer.tsx`: native formats via object URLs from
  `/api/files/raw`; TIFF decoded per page → canvas → PNG blob; header with name,
  `tiff` badge, ‹ n/N › page nav (disabled at bounds), zoom −/%/+ (25–400%, default
  100%), gear → module settings. Registered between pdf and log in defs/registry.
  Explorer rowClick/double-click/menu + drag-drop route image names to it;
  `.image-*` pane styles added.
- `app` — `AppCtx.imageFile` + `onOpenImage` (opens file, activates module);
  deleted images cleared via `onPathsGone`.
- `backend` — `tests/test_files.py` pins the raw endpoint contract: `.tiff`/`.tif`
  serve as `image/tiff`, non-image → 415, missing → 404, >5 MB → 413.

Verification (merge gate): pytest 44 passed; vitest 17 passed; `tsc --noEmit` +
`vite build` clean. Headless-Chrome CDP end-to-end against a fixture project
(`/home/minkota/code/imgtest55`: red.png, blue.png, gradient.tiff 4×3, pages.tiff
2-page): modal open → tree lists all four; gradient.tiff decodes to 4×3 with the
`tiff` badge; pages.tiff shows `1/2`, Next → `2/2` with a changed blob src;
red.png renders native at 64 px with no badge; Zoom in scales to 80 px (125%).

Known v0 limitation (accepted): tree thumbnails for `.tiff` fall back to the file
icon because `<img>` cannot decode TIFF natively — no crash, noted here per the
ticket's requirement 4.
