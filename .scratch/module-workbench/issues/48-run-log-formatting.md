# 48 — Run log formatting: timing, coloured events, end-of-run error list

Status: needs-triage
Machine: home

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

**Decisions at claim (2026-10-01):**

1. **Per-line timing: elapsed offsets from run start, rendered as a gutter prefix; wall-clock kept in the line tooltip.** The backend stamps every log line with `t` (epoch seconds, float) at append time and adds `started_at` / `finished_at` to the job snapshot. The client renders a fixed-width `+MM:SS.d` elapsed offset per line (`t - started_at`) and puts the local wall-clock time in the line's `title` tooltip. Rationale: the user's pain is "which step ate the time" — an elapsed offset answers that directly on every line (a download at `+02:31` vs the next line at `+02:34` shows a 3 s stall; two tlmgr lines 90 s apart show a slow install) without depending on client/server timezone agreement, and it stays compact. Wall-clock remains available for correlation (hover), not per-line clutter. Phase-level durations alone would not show *which* line was slow, so they are rejected as the only mechanism.

2. **Level classification: client-side, in one pure function.** The backend stores `{t, text}` per line only; the level is derived in `workbench/web/src/logClassify.ts` (`classifyLine(text) -> "plain" | "err" | "warn" | "phase" | "progress" | "ok"`) from known output patterns, covered by vitest. Rationale: the ticket itself allows this alternative ("derive level client-side from known patterns — decide at claim time"). The only per-line datum that must come from the backend is the timestamp (the client clock cannot know when a line was produced server-side); level is a display concern over stable patterns (`!`, `error`/`failed to`, `warning:`, dashed `--- markers ---`, step-verb headers, `tlmgr:` progress, `downloaded N MB`, success phrases). Keeping it in one testable client function avoids pushing display logic into the shared backend Job and keeps the API shape minimal.

3. **End error list: fixed footer section below the scrolling log, replacing the top block.** Rationale: the requirement says "at the END of the log (not above it)". Appending the list inside the scroll area would let it be scrolled away by later output and makes it compete with auto-scroll while new lines arrive; a fixed footer (own scroll, capped height, tinted background) is always visible whenever errors exist and reads as the run's summary. The current top block (`LogPanel.tsx` `.log-errors`) is removed, per "not above it".

4. **Click-to-jump: raw-text match.** Each `JobError.raw` is exactly the log line that triggered the error, so clicking a footer entry finds the first `logLines` entry whose text equals `raw` (trimmed), scrolls it into view and flashes a highlight for ~1.8 s. If no match is found (should not happen — every logged line is retained) the click is a no-op. No source-line → log-index mapping table is needed; `JobError.line` keeps meaning "source line" as before.
## Run log

- 2026-10-01: board run 997c9e71 (session session-e5ea758c-0c9d-4d47-b0c0-7fc22db6d491) recorded the claim decisions above (commit 8b478bd), then died mid-turn after ~199 min with error "agent turn ended with an error". No implementation work was committed; local branch feat/48-run-log-formatting left at main. Ticket stays open.
