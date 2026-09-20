# 31 — Line numbers (toggleable) + active-line highlight box

Status: resolved (2026-09-20, main; code commits d919f33 module(editor) + 38f4040 web(core))

## Idea (user)

Line numbers on the left of the editor window, turnable on and off. The
number of the **active line** sits in a colorful box. Rationale: sometimes you
lose track of where the cursor is — seeing the active line makes working much
smoother.

## Design

- **Extensions** (`EditorPane.tsx`) — CodeMirror 6 ships both pieces; when the
  setting is on the view gets `lineNumbers()` plus `highlightActiveLine()` and
  `highlightActiveLineGutter()` from `@codemirror/view`. The gutter toggle rides
  the same recreate-the-view path as word wrap / tab size (the extensions are
  state-level, so flipping them rebuilds the view); the destroy-time flush keeps
  unsaved edits safe across the rebuild.
- **Toggle** — "Line numbers" in the editor gear menu: one global switch
  (consistent with every other editor setting; per-extension defaults were
  considered and dropped for simplicity), default **on** — the feature exists to
  be seen. Persisted with the other editor settings under `workbench.settings.v1`.
- **Vesper styling** (`styles.css`) — no new colors: the active line's number
  sits in a sand-tinted box (`rgba(sand, .3)`, 2px radius) with gold-bright text,
  the same anchor as the pre-existing faint full-line tint (`.cm-activeLine`,
  `rgba(sand, .06)`); the gutter itself already follows the theme spec (brown on
  base). Sand = "attention without urgency" per app_theme.md — reds stay reserved
  for action.

## Verification plan

Done (2026-09-20) — harness `test-latex-project/linenum_test.mjs`, 15/15, headless
Chrome CDP against the live app:

- Gutter visible by default; numbering runs 1..13 over a 13-line fixture (the
  extra DOM element is CM6's hidden width-reserving spacer, inline
  `visibility: hidden` — filtered out of the assertions).
- With the cursor on line 9 its number carries `.cm-activeLineGutter` with the
  sand box + gold-bright text and the content line carries `.cm-activeLine`;
  two ArrowDown presses move the box to lines 10 and 11.
- Gear-menu "Line numbers" toggle defaults On; toggling off removes the gutter
  live (view rebuild) and stores `lineNumbers=false`; a full page reload with
  the project re-opened keeps the gutter hidden; toggling back on restores the
  numbered gutter and stores `true`.

## Comments

Claimed & implemented 2026-09-20. Decisions: one global switch (not per-file-type)
with default on; the "colorful box" reuses existing anchors — sand tint + gold-bright
number, no brick (red is for action only); the full-line active highlight was enabled
too, since its CSS rule already existed in the theme and the rationale is "seeing the
active line". Toggling recreates the view like word wrap does — cursor position resets
on toggle, consistent with existing behavior.
