# 32 — Vite serves a stale transform when the watcher misses file changes (WSL/UNC share)

Status: resolved (fixed by `server.watch.usePolling` + dev-server restart; verified on the real project)

## Report

The user reported that the issue-27 citation tooltip "works in the test project
but does not work with my real project" (`F:\Work\Papers\3_progress\2026 Tomography
& cytotoxicity\manuscript` — MDPI Toxics class, natbib numbered style, 95 refs).

## Root cause

The running Vite dev server (started before the last file modification) served a
**stale pre-issue-27 transform** of `PdfViewer.tsx` (and an intermediate-state
`pdfRefs.ts`). The chokidar watcher missed the file-change events on this
WSL/UNC share, so the in-memory transform cache was never invalidated and the
old module was served indefinitely.

Evidence chain:

1. `curl http://127.0.0.1:5199/src/components/PdfViewer.tsx` returned a 714-line
   transform with **zero** occurrences of `loadCompiledRefs` / `pdf-cite-tip`,
   while disk/HEAD had 795 lines containing both (issue-26 marker code present,
   issue-27 wiring absent — an intermediate development state).
2. The sidecar served the project's aux/bib/bbl fine (HTTP 200); the full parse
   chain (aux → bib → RefMap) works in Node on the exact served bytes
   (md5-identical to disk) — data was never the problem.
3. React fiber probe of the live page: `refsCacheRef` empty, zero raw-file
   network calls from the app — impossible unless the fetch effect does not
   exist in the running bundle.

Why it was invisible: the stale version still rendered issue-26's `.pdf-cite`
markers (150+ of them), so the pane *looked* alive; only the tooltip wiring was
missing, and by design data absence degrades silently (no status chip).

## Fix

- `workbench/web/vite.config.ts`: `server.watch: { usePolling: true, interval: 500 }` —
  polling detects changes even when inotify events are dropped on this share.
- Restarted the Vite dev server to clear the stale transform cache.

## Verification (real project)

After the restart, headless Chrome CDP against the real manuscript: the fetch
effect ran (aux + bib → 95-entry RefMap); a real mouse hover on `[7]` raised the
tooltip "Male infertility" / Agarwal et al. / `doi: 10.1016/S0140-6736(20)32667-2`;
group marker `[3,4,5]` resolved via its first number. Compiled mode is fully
functional on the real project.

## Notes for future sessions

- If app behavior looks older than the code on disk, diff
  `curl http://127.0.0.1:5199/src/<module>` against the file on disk **before**
  debugging app logic.
- Browsers that loaded modules from the stale server need one hard refresh
  (Ctrl+Shift+R) to drop any cached copies.

## Comments

(created and resolved in one session: user report → stale-bundle diagnosis →
polling fix + restart → real-project CDP verification)
