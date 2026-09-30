# 48 — Run log formatting: timing, coloured events, end-of-run error list

Status: needs-triage

## Request (user)

"We need to add more logger formating. Right now it is a little bit complicated
to read. I believe we need to add timing, add colour to some events etc and we
need to collect errors to show them as list in the end."

## Current state

- `workbench/web/src/components/LogPanel.tsx` renders raw string lines from
  `job.logLines`; the only styling is a per-line regex
  `/error|undefined control sequence|fatal/i` adding class `.err`
  (LogPanel.tsx:77).
- Parsed errors (`JobError { line, message, raw }`, built by `ErrorParser` in
  `workbench/backend/workbench_backend/errors.py`) are shown in a block at the
  TOP of the panel (`.log-errors`, LogPanel.tsx:65–74) — above the log.
- No timing anywhere: no per-line timestamps, no elapsed time, no total run
  duration; `Job` (`workbench/backend/workbench_backend/jobs.py`) stores plain
  strings with no metadata.

## Requirements

1. **Timing** — show how long things take: at minimum a total run duration in
   the panel header (live while running, final when settled); per-line
   timestamps or elapsed offsets so slow steps (downloads, tlmgr installs) are
   visible.
2. **Coloured events** — classify lines beyond "error": warnings, phase/step
   headers (download / extract / install / compile), package-install progress
   (`tlmgr:` lines), and success/completion lines each get a distinct style
   from the Vesper palette; plain TeX output stays neutral.
3. **Error list at the end** — collect all errors of the run and render them
   as a summary list at the END of the log (not above it); entries keep their
   `line` number so clicking one can jump to / highlight the spot in the log.

## Implementation notes

- Backend: `Job.log()` currently appends bare strings — extend lines with
  metadata (timestamp + level), e.g. store `{t, level, text}` and emit them in
  `snapshot()`; keep `text()` joining for the compile retry loop unchanged.
  Alternatively derive level client-side from known patterns (`tlmgr:`, `!`,
  `warning:`) — decide at claim time; per-line wall-clock timestamps need the
  backend either way.
- Frontend: LogPanel.tsx line classification + CSS in
  `workbench/web/src/styles.css` (`.log-line.warn`, `.log-line.phase`, …);
  move the error summary below the scroll area or as a final section inside
  it; header gains the duration readout.
- Applies to both job kinds (compile and install) — they share `Job`.

## Open questions

- Per-line: wall-clock time, elapsed offset from run start, or only phase-level
  durations?
- End error list: appended at the bottom of the scrolling log vs a fixed
  footer section below it? Keep the current top block too (or replace it)?
- Click-to-jump: `JobError.line` is a source line, not a log index — mapping to
  the raw log position needs the `raw` text.

## Related

- #06 — In-app TinyTeX (its tlmgr progress lines are exactly what needs phase
  colouring)
- `workbench/backend/workbench_backend/compile_service.py` — retry loop
  consuming `Job.text()`

## Comments

New ticket (2026-09-30); user request quoted above.
