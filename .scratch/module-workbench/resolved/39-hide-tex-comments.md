# 39 — Toggle .tex comment lines on/off in the editor

Status: resolved (2026-09-28; minkota office machine, WSL2)

Design resolved 2026-09 (user answers below, plus one agent ruling); implemented 2026-09-28.

## Design (resolved)

1. **Toggle placement**: editor settings menu only — no pane-header button (user).
2. **Detection**: full-line comments only — a line whose first non-whitespace
   character is `%`. Inline trailing comments stay out of scope for v1 (user).
3. **Verbatim skip** (user: "it must skip verbatim"): detection skips lines inside
   balanced `\begin{…}…\end{…}` pairs where the environment treats `%` as literal —
   any name containing `verbatim`, plus `comment` and `luacode`/`luacode*`.
   v1 limitation: only *balanced* pairs are recognized; an unclosed
   `\begin{verbatim}` is not detected.
4. **Line-number gaps — agent ruling**: keep the real line numbers, with gaps.
   pdflatex error messages and syncTeX (forward and inverse) report true document
   line numbers, so the gutter must keep showing them; renumbering would break that
   mapping and needs a custom gutter. Gaps are informative: they show where hidden
   lines were.
5. **Search** (user: exclude while invisible + add a note): while hiding is on,
   hidden lines are excluded from find/replace/select-all by injecting the official
   `SearchQuery.test` filter; it is stripped again when nothing is hidden. The user
   note is two-fold: a hint line under the toggle in the settings menu ("hidden
   lines are excluded from search — turn off to find them again") and a persistent
   "comments hidden" chip in the pane header while active, with an explanatory
   tooltip.
6. **Scope**: `.tex` only for now (user); other comment styles in future tickets.

Display-only invariant: comments are never removed or modified on disk — autosave,
compile and syncTeX keep working against the real document.

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
  pane header (next to Save / Compile)? : Editor settings
- Detection rule: full-line comments only (first non-whitespace char is `%`), as
  requested — or should *inline* trailing comments (`text % note`) be hidden too?
  Hiding just the inline part means replacing a range mid-line, a bigger change.
  Suggest: full-line only for v1. full-line
- Verbatim environments: inside `\begin{verbatim}…\end{verbatim}` (and friends)
  a `%` line is literal content, not a comment — hiding it would misrepresent the
  compiled output. Should detection skip verbatim blocks, or accept the edge case?: it must skip verbatim
- Line-number gaps: acceptable (arguably informative), or should the gutter be
  suppressed while comments are hidden?: not sure, need your experm opinion based on best practices
- Interaction with search (`Mod-f`): matches inside hidden comment lines stay in
  the document state; jumping to one lands on an invisible position. Accept, or
  exclude hidden ranges from search? : exclude from serach while invisible, but needs to add note about this for a user to prevent a situation when user adds comment, makes it invisible, can not find its own comment
- Scope: `.tex` only (as requested), or should the same toggle later cover other
  comment styles (`.bib` `%`, markdown `#`, …)?: only .tex for now, in future we will in other tickets but now there is no modification except .tex

## Verification (when implemented)

- `tsc --noEmit` clean; vite build OK.
- Headless CDP against 127.0.0.1:5199 with a test project: open a `.tex` file
  containing full-line and inline comments; toggle off via the editor settings
  menu — comment lines disappear from the DOM, line numbers skip, and the **file
  on disk is byte-identical** (probe via sidecar); toggle on restores them;
  compile + syncTeX forward/inverse still map to the correct document lines.

## Comments

(placeholder ticket; design discussion to be appended here before work starts)

## Resolution (2026-09-28, minkota office machine, WSL2)

Implemented per the resolved design:

- `workbench/web/src/texHideComments.ts` — new module. A
  `StateField<DecorationSet>` that, while enabled, decorates every hidden full-line
  comment with a `Decoration.replace({})` over the line's own span (never the
  trailing newline — including it merges the line with its successor in the
  render), plus a line tag and a gutter marker so CSS collapses the row to zero
  height and hides its number cell. Verbatim skip scans **every** `\begin{env}`
  (regex exec loop) and resolves each literal environment's `\end{env}` by plain
  string search, so escaped names like `luacode*` work; only balanced pairs are
  recognized (documented v1 limitation). The decoration set is built with
  `Decoration.set(ranges, true)` — CM6's default unsorted build throws on replace
  spans and line tags sharing a `from` position.
- Search exclusion: an official `SearchQuery.test` filter that rejects matches
  overlapping any hidden line; it reads the field live at match time, so document
  edits need no re-dispatch. A small update listener keeps the active query in
  sync — the search panel re-commits queries without the `test` property, so the
  filter is re-applied on every new/changed query while anything is hidden, and
  stripped when the hidden set becomes empty.
- `EditorPane.tsx` — `hideComments` setting (default off, persisted with the other
  editor settings), live toggle via the existing ref + forced-rebuild pattern, a
  "comments hidden" chip in the pane header while active; the extension is applied
  to `.tex` files only.
- `SettingsMenu.tsx` / `settings.ts` — optional per-setting hint line rendered
  under the label; the toggle carries the user-facing note that hidden lines are
  excluded from search and how to find them again.
- `styles.css` — zero-height collapse for hidden rows + gutter-cell hiding,
  Vesper anchors only.

Verification: **25/25** by headless Chrome CDP against a 13-line fixture project
(`/home/minkota/code/test-latex-project/hide_comments_test.mjs`, kept as the
standing suite): baseline render; settings row + hint present; toggle on — full-line
comments gone from the DOM, inline trailing comment and the `%` line inside
`\begin{verbatim}` stay visible, gutter keeps real numbers with gaps at 2/4/12,
chip appears, setting persists, **file on disk byte-identical** (display-only);
search finds only the verbatim occurrence while hidden; replace-all rewrites only
that visible match (hidden comment lines intact on disk); toggle off — all lines
back, filter removed, remaining comment lines searchable again; fixture restored.
`tsc --noEmit` clean; vite production build OK.

Deferred: the compile + syncTeX forward/inverse leg of the verification plan —
this machine has no TinyTeX (`workbench/.texlive` absent), so end-to-end
compile/syncTeX mapping was not exercised here. The design keeps it safe by
construction: decorations are display-only and the gutter shows true document line
numbers, which is exactly what syncTeX reports.
