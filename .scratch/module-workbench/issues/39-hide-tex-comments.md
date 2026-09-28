# 39 — Toggle .tex comment lines on/off in the editor

Status: needs-triage

**Before implementation work on design.** No design decided yet — this ticket is a placeholder for the feature request only.

## Request

User request (2026-09): in the `.tex` editor, be able to **turn comments on and
off** — lines starting with `%`. Motivation: comment-heavy LaTeX documents are
hard to read; hiding the full-line comments gives a clean "writing view" of the
document.

Interpretation (to confirm at triage): this is a **display toggle only** —
comment lines are hidden from the editor view, never removed or modified on
disk. File content, autosave, compile and syncTeX line numbers all keep working
against the real document.

## Sketch of how it fits the current editor

- New editor setting (gear menu): a `toggle` alongside the existing
  `lineNumbers` / `posTags` entries in `EDITOR_SETTINGS`
  (`workbench/web/src/components/EditorPane.tsx`), default **off** (comments
  visible). Persisted with the other module settings.
- A small CodeMirror `StateField<DecorationSet>` + plugin that, when enabled,
  decorates every full-line comment — a line whose first non-whitespace
  character is `%` — with `Decoration.replace` over the whole line **including
  its trailing newline**. Replacing (rather than CSS-hiding `.cm-line`) also
  removes the gutter cell, so line numbers read as gaps (1, 2, 4, …) instead of
  leaving orphaned numbers.
- Live toggle without recreating the view: same pattern as spellcheck /
  position tags — a `getEnabled` ref + a forced `dispatch({})` on change (the
  existing `useEffect` in EditorPane.tsx already does this for `posTags`).

## Open design questions (to resolve before implementation)

- Toggle placement: editor settings menu only, or also a one-click button in the
  pane header (next to Save / Compile)?
- Detection rule: full-line comments only (first non-whitespace char is `%`), as
  requested — or should *inline* trailing comments (`text % note`) be hidden too?
  Hiding just the inline part means replacing a range mid-line, a bigger change.
  Suggest: full-line only for v1.
- Verbatim environments: inside `\begin{verbatim}…\end{verbatim}` (and friends)
  a `%` line is literal content, not a comment — hiding it would misrepresent the
  compiled output. Should detection skip verbatim blocks, or accept the edge case?
- Line-number gaps: acceptable (arguably informative), or should the gutter be
  suppressed while comments are hidden?
- Interaction with search (`Mod-f`): matches inside hidden comment lines stay in
  the document state; jumping to one lands on an invisible position. Accept, or
  exclude hidden ranges from search?
- Scope: `.tex` only (as requested), or should the same toggle later cover other
  comment styles (`.bib` `%`, markdown `#`, …)?

## Verification (when implemented)

- `tsc --noEmit` clean; vite build OK.
- Headless CDP against 127.0.0.1:5199 with a test project: open a `.tex` file
  containing full-line and inline comments; toggle off via the editor settings
  menu — comment lines disappear from the DOM, line numbers skip, and the **file
  on disk is byte-identical** (probe via sidecar); toggle on restores them;
  compile + syncTeX forward/inverse still map to the correct document lines.

## Comments

(placeholder ticket; design discussion to be appended here before work starts)
