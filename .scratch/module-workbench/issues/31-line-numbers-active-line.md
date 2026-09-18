# 31 — Line numbers (toggleable) + active-line highlight box — BACKLOG

Status: open (requested 2026-09-18; not claimed, not scheduled)

## Idea (user)

Line numbers on the left of the editor window, turnable on and off. The
number of the **active line** sits in a colorful box. Rationale: sometimes you
lose track of where the cursor is — seeing the active line makes working much
smoother.

## Notes for whoever claims this

- CodeMirror 6 ships both pieces: `lineNumbers()` from `@codemirror/view` and
  `highlightActiveLine()` / `highlightActiveLineGutter()` (the latter gives
  exactly the "colorful box" on the active line's number).
- Wire an editor-settings toggle (default choice to be decided at claim time —
  likely on for .tex, off elsewhere, or one global switch) and persist it with
  the other editor settings.
- Vesper palette: reuse existing anchors for the active-line box (no new
  colour).

## Verification plan

TBD at claim time: CDP check that toggling shows/hides the gutter, that the
active line's number carries the highlight class as the cursor moves, and
that the setting persists across reload.

