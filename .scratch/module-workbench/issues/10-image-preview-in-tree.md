# 10 — Image preview in the explorer tree (M3)

Status: resolved

## Scope
The M3 plan lists "image preview in the tree" as a remaining item. File entries
with a known image extension should show a small decoded thumbnail instead of
the generic file icon, so figures are recognizable at a glance in the explorer.

## Implementation
- `backend/workbench_backend/files.py` — new `raw_image(root, rel)`: resolves via
  `safe_path` (same traversal guard as every other file API), requires a known
  image media type (`mimetypes.guess_type`, must start with `image/`), enforces a
  5 MB safety cap (`RAW_IMAGE_MAX_BYTES`), and returns `(bytes, media_type)`.
- `backend/workbench_backend/app.py` — `GET /api/files/raw?path=...` serves the
  bytes with the guessed content type and `Cache-Control: no-store` (thumbnails
  must track on-disk state; object URLs already bypass HTTP caching).
- `web/src/api.ts` — `fetchFileBytes(path)`: token-authenticated fetch returning
  a `Blob`, or `null` when the backend refuses (404/413/415), so the UI can fall
  back silently. Same pattern as `fetchPdf`.
- `web/src/icons.tsx` — exports `IMAGE_EXTS` and adds `isImageName(name)`;
  `entryIcon` now uses it.
- `FileExplorer.tsx` — new `ImageThumb` component: fetches the bytes, creates an
  object URL (revoked on unmount/re-fetch), renders an 18×18 cover thumbnail;
  falls back to the regular file icon while loading, on error, or when the file
  is larger than `THUMB_MAX_BYTES` (1.5 MB). The row's mtime is a dependency of
  the fetch effect, so a tree refresh after an on-disk change re-fetches.
- `styles.css` — `.tree-thumb` (18×18, object-fit: cover, 3px radius).

## Verification
- Build: `tsc --noEmit` clean; `vite build` OK (pre-existing chunk-size warning
  only).
- Endpoint checks (curl against the running sidecar, scrolltest project open):
  - `imgtest/a.png` → 200, `Content-Type: image/png`, downloaded bytes identical
    to the file on disk (`cmp`).
  - 7.7 MB PNG → 413; `main.tex` → 415; missing path → 404; `../main.tex`
    traversal → 400; no token → 401.
- Live CDP end-to-end in the real app at 127.0.0.1:5199 (headless Chrome,
  trusted mouse events), using three generated PNGs in `scrolltest/imgtest/`
  (64×64 solid red, 64×64 solid blue, ~7.7 MB of noise):
  - exactly two thumbnails render (the two small PNGs); each decodes at the
    source size 64×64; `main.tex` and the oversized file keep plain icons.
  - canvas pixel readback of the decoded thumbnails matches the source bytes
    exactly: red (230,30,30) and blue (30,60,220).
  - single-clicking a thumbnail row still selects it.
  - overwriting `a.png` on disk with the blue file's bytes + clicking Refresh
    re-fetches (mtime-driven): the thumbnail is now blue.
  - no page exceptions during the run.
- Test-asset note: the PNGs are generated in pure Python (zlib + struct). A
  first version of the generator emitted 3 bytes per scanline instead of
  3×width, which Chrome "decoded" as a black image; the setup script now decodes
  each file back and asserts scanline geometry and pixel content before use.

## Accepted v0 limitations
- Thumbnails fetch the full file (up to 1.5 MB) and let the browser scale it;
  there is no server-side downscaling (no image library in the sidecar).
- No hover zoom / lightbox; double-clicking an image still routes to the editor,
  which shows the existing "binary file" error (same as for PDFs today).
- Thumbnails go stale until a tree refresh (the explorer has no file watching);
  animated GIFs show only their first frame.
