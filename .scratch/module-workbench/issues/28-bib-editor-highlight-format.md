# 28 — BibTeX editor: colour palette + Format action (same logic as JSON)

Status: resolved (2026-09-18, main)

## Scope

Opening a `.bib`/`.rbib` file in the editor gives it two things:

1. **Colour palette** — BibTeX syntax highlighting on the Vesper anchors
   (no new colours): entry types (`@article`, …) in gold-bright structural
   keyword, entry keys as citation atoms (gold-bright, same tier as the keys
   inside `\citep{…}` in .tex), field names in sand keyword, values as
   default prose, braces/commas in taupe punctuation, `%` comments brown italic.
2. **Format action** — a `Format` button in the pane header (BibTeX tabs only)
   that pretty-prints the file with the same logic as JSON formatting: parse
   into entries, re-emit canonically. One field per line, 2-space indent,
   whitespace inside values collapsed to single spaces, one blank line between
   blocks; comments and other non-entry text preserved in place; idempotent.

## Design

- **Tokenizer** (`web/src/bibMode.ts`) — StreamLanguage mode `bibLanguage`,
  four-phase state (top → afterType → key → fields) carried across lines:
  `%` to EOL = comment; `@word` = entry type (standard types from
  `STANDARD_BIB_TYPES` → `keyword.special`, custom types plain `keyword`);
  for keyed entries the first token before the top-level comma is the key
  (`citation` atom via `tokenTable`); then field names + optional `=` as
  keywords, values consumed as prose with brace-depth tracking (balanced `{…}`
  across lines), quoted `"…"` and `<…>` values; `,`/`}` = brackets.
- **Formatter** (`web/src/bibFormat.ts`) — pure string→string module, no DOM
  or API: `scanBibEntries` (brace-balanced scanner; only
  `@string/@comment/@preamble` are non-keyed and re-emitted verbatim),
  `splitTopLevel` (splits on top-level separators respecting brace depth AND
  quote state — quotes toggle, they do not nest), `tidyValue`, `renderEntry`,
  `formatBib`. Entry order and field order preserved; no trailing comma.
- **Editor wiring** (`web/src/components/EditorPane.tsx`) — `langForPath`
  maps bib/rbib → `bibLanguage`; `Format` button dispatches one undoable
  change (0→doc.length) when the formatted text differs; autosave follows.

## Verification plan

- `tsc --noEmit` + `vite build` clean.
- Node harness (`workbench/web/verify/bib-format.mjs`,
  `--experimental-strip-types`): messy sample → exact canonical output,
  idempotency, no-entry files untouched, quoted/nested-brace values intact,
  non-keyed entries verbatim, citation hints (author/year, et al.).
- Node harness (`workbench/web/verify/bib-mode.mjs`): real `bibLanguage`
  through `syntaxTree` — token name per source range (comment, entry type,
  key, field name, bracket).
- CDP UI check: open refs.bib in the running app → token classes present;
  Format click canonicalizes the file on disk, second click is a no-op.

## Comments

- Resolved 2026-09-18 (main). `tsc --noEmit` + `vite build` clean. Node
  harnesses: `verify/bib-format.mjs` 13/13 (canonical output, idempotency,
  no-entry passthrough, quoted/nested-brace values intact, non-keyed entries
  verbatim, citation hints) and `verify/bib-mode.mjs` 6/6 (token names through
  the real `syntaxTree`). CDP UI suite (headless Chrome :9333, test project):
  computed colors on the open refs.bib — entry type gold-bright
  rgb(195,168,147) weight 600, key gold-bright, field name sand
  rgb(179,143,111), comment brown rgb(141,117,100) italic, brace taupe
  rgb(188,177,160); Format button present on the .bib tab and absent on .tex;
  one Format click canonicalized the file on disk to the expected text, second
  click a no-op.

- Re-verified 2026-09-19 on the minkota office machine (checkout of main in
  sync with origin, clean tree): tsc --noEmit + vite build clean; Node harnesses
  verify/bib-format.mjs 13/13 and verify/bib-mode.mjs 6/6; CDP UI suite (headless
  Chromium :9333, test-latex-project) — computed colors on refs.bib as specified
  (entry type gold-bright rgb(195,168,147) weight 600, key gold-bright, field
  name sand rgb(179,143,111), brace taupe rgb(188,177,160)), Format button
  present on the .bib tab and absent on .tex, one click canonicalized the
  padded refs.bib on disk (second click a no-op).
