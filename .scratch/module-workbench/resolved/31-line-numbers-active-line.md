# 31 — Line numbers (toggleable) + active-line highlight box

Status: resolved (2026-09-20, main; code commits d919f33 module(editor) + 38f4040 web(core)); refined 2026-09-20 per user feedback (be97e80 web(core)); refined 2026-09-20 — gutter rendered on CodeMirror's light surface, now dark (41aec78 module(editor) + d563d61 web(core)); refined 2026-09-20 — active-line cell warmed toward sand (b60e140 web(core))

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
  sits in a cell one surface step lighter than the gutter base (`--bg-active`)
  with pearl text (the app's active-row idiom), and a strong hairline on its
  right edge separates it from the editor space. Refined per user feedback: the
  first cut was a sand tint + gold-bright number, which read as "light" — the box
  must stay dark and quiet. The faint full-line tint (`.cm-activeLine`,
  `rgba(sand, .06)`) is unchanged.

## Verification plan

Done (2026-09-20) — harness `test-latex-project/linenum_test.mjs`, 16/16, headless
Chrome CDP against the live app:

- Gutter visible by default on the Vesper base surface (`--bg-base`,
  `--hairline` right edge — not CodeMirror's light gutter); numbering runs 1..13
  over a 13-line fixture (the extra DOM element is CM6's hidden width-reserving
  spacer, inline `visibility: hidden` — filtered out of the assertions).
- With the cursor on line 9 its number carries `.cm-activeLineGutter` as a
  `--bg-active` cell with pearl text and a strong hairline right edge, and the
  content line carries `.cm-activeLine`; two ArrowDown presses move the box to
  lines 10 and 11. Re-verified after the box refinement (screenshot:
  `test-latex-project/linenum_box.png`).
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

Refined 2026-09-20 (user feedback: "It should not be light. Slightly lighter than
background and should have line split from editor space"): the sand-tinted box +
gold-bright number became a `--bg-active` cell — one surface step up from the
gutter base, pearl text, 1px `--hairline-strong` right edge, no radius. Harness
assertions updated to the new computed values; still 15/15. Code: be97e80 web(core).

Refined 2026-09-20 (user feedback: "I do not like that the vertical line for
numbers of lines is white"): the whole gutter column rendered on CodeMirror's
built-in light surface (#f5f5f5 with a #ddd border) — the base theme applies its
&light rules one specificity level above our bare .cm-* selectors, and the editor
carried the light class because EditorView.darkTheme was never set. Fix: vesperChrome
now passes {dark: true} to EditorView.theme (the editor carries the dark class), and
every Vesper color rule in styles.css is scoped under .editor-host .cm-editor so it
wins the cascade. Harness gained a gutter-surface assertion (L1c) and an exact
active-line tint check (L2d): 16/16. Code: 41aec78 module(editor), d563d61 web(core).

Known deviation left open for user decision: the base theme's .cm-scroller rule
(font-family monospace, line-height 1.4) also beats Vesper's design values, so the
editor currently renders in generic monospace at 1.4 instead of --font-editor
(Palatino serif, 1.7); the user's line-height setting (--cm-lh) is set inline but
loses to the base rule. Same root cause; not fixed yet — awaiting a decision on
whether the editor should be serif per the design or monospace (in which case the
design tokens and the line-height control need rethinking).

Refined 2026-09-20 (user feedback: "Active line colour should be a little bit
different"; clarified: target = the number box, direction = different hue rather
than strength): the cell moved from the neutral --bg-active step-up to a warm
amber-brown #402d1b — same lightness as before, hue pushed toward --sand so it
reads as a warm marker against the quiet gutter. Pearl text and the hairline-
strong right edge are unchanged; the full-line sand tint is unchanged (the user
pointed at the box only). Harness L2b updated to the new computed value; 16/16.
Code: b60e140 web(core).
