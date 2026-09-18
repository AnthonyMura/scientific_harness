# 25 — Citation key highlight: author names in \citep{…} & kin, gold-bright (warm bone)

Status: resolved (2026-09-18, main; code commits a26b448..354608d; colour revised to gold-bright in 83e9314)

## Scope

In the editor's LaTeX regime (.tex), the author names inside citation
commands — `\citep{smith2023,jones2024}` and its siblings — render in the
theme's warm bone neutral (gold-bright, `--gold-bright`), standing out of the
manuscript without shouting.
The command itself keeps its sand keyword color; only the keys inside the
required `{…}` argument are highlighted.

Covered commands (visible natbib-style citations, starred variants included):
`\cite`, `\citet`, `\citep`, `\citealp`, `\citealt`, `\fullcite`.
Optional `[prenote]`/`[postnote]` arguments stay default-colored; `\nocite`
(invisible citation) is not covered.

## Design

- **Tokenizer** (`web/src/latexMode.ts`) — the stream parser gains a small
  three-phase state carried on the parser state (`pending` → `opt` → `keys`):
  after a cite command it waits for `{…}` (skipping `*`, spaces, and any
  `[optional]` argument) and emits a custom `citation` token for each run of
  key characters (commas included; whitespace between keys stays default).
  The state rides across lines, so `\citep` at end of line still colors the
  argument on the next line. `tokenTable: { citation: t.special(t.atom) }`
  maps the token name to its own Lezer tag — deliberately not `t.link`, which
  the shared Markdown mode also emits (links stay unstyled per the theme).
- **Theme** (`web/src/vesperTheme.ts`) — one new rule:
  `{ tag: t.special(t.atom), color: "var(--gold-bright)" }` — the warm bone.
  Token-only, no raw hex in components (app_design_guide.md rule 2).

## Implementation steps (one commit each)

1. **Plan** — this ticket. Commit: `docs(scratch): …`.
2. **Theme rule** — Vesper highlight style gains the brick-red citation rule.
   Commit: `web(core): …`.
3. **Tokenizer** — latexMode.ts state machine + tokenTable. Commit:
   `module(editor): …`.
4. **Docs** — README status line, plan progress note, theme spec
   (`app_theme.md`), ticket verification + resolved status. Commits:
   `docs(readme)`, `docs(workbench)`, `docs(theme)`, `docs(scratch)`.

## Verification

Done (2026-09-18):

- Tokenizer harness (Node 22, `--experimental-strip-types`): parses a sample
  document through the real `latexLanguage` extension and asserts styled
  ranges via `highlightTree`:
  - `\citep{a,b}`, `\citet{…}`, starred `\citep*[prenote]{…}`, double-optional
    `\citep[pre][post]{a,b}` → keys are the `citation` tag, prenotes not.
  - Argument split across a line break and an unclosed `{key` at EOF both
    color correctly (no parser hang — the stream guard would throw).
  - `\nocite{…}`, comment text, and non-cite command arguments stay uncolored;
    structural commands keep `keyword.special` (gold-bright).
- `tsc --noEmit` clean; `vite build` clean (pre-existing chunk-size and
  hunspell externalization notes only).

## Comments

Colour revision (2026-09-18): brick was tried first per the original request,
but it read too loud for inline text — a saturated hue punch that belongs on
the Compile button, not in the manuscript. Settled on `--gold-bright`
(`#C3A893`), the theme's warm bone: ≈8:1 on canvas, brighter than command sand
so keys stand out of prose while staying in the attention family. Rejected:
taupe (the braces' own colour — keys would dissolve into `{…}`), sand (the
commands' own colour — keys lose their identity), a new "bone" token (the
palette is nine anchors, each with one job).
