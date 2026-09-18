# 25 — Citation key highlight: author names in \citep{…} & kin, brick red

Status: open (2026-09-18)

## Scope

In the editor's LaTeX regime (.tex), the author names inside citation
commands — `\citep{smith2023,jones2024}` and its siblings — render in the
theme's brick red (`--brick`) so references stand out of the manuscript.
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
  `{ tag: t.special(t.atom), color: "var(--brick)" }`. Token-only, no raw hex
  in components (app_design_guide.md rule 2).

## Implementation steps (one commit each)

1. **Plan** — this ticket. Commit: `docs(scratch): …`.
2. **Theme rule** — Vesper highlight style gains the brick-red citation rule.
   Commit: `web(core): …`.
3. **Tokenizer** — latexMode.ts state machine + tokenTable. Commit:
   `module(editor): …`.
4. **Docs** — README status line, plan progress note, ticket verification +
   resolved status. Commits: `docs(readme)`, `docs(workbench)`,
   `docs(scratch)`.

## Verification

Planned (to be filled in at resolution):

- Tokenizer harness (Node 22, `--experimental-strip-types`): parses a sample
  document through the real `latexLanguage` extension and asserts styled
  ranges via `highlightTree`:
  - `\citep{a,b}`, `\citet{…}`, starred `\citep*[prenote]{…}`, double-optional
    `\citep[pre][post]{a,b}` → keys are the `citation` tag, prenotes not.
  - Argument split across a line break and an unclosed `{key` at EOF both
    color correctly (no parser hang — the stream guard would throw).
  - `\nocite{…}`, comment text, and non-cite command arguments stay uncolored;
    structural commands keep `keyword.special` (gold-bright).
- `tsc --noEmit` + `vite build` clean.

## Comments

Brick on the editor canvas (`--bg-base`) is a deliberate low-contrast accent
(≈1.7:1) — the theme's red family has no lighter text-safe member except
`--err`. If the keys need to pop more, the rule is a one-line switch to
`var(--err)` or a lifted brick variant.
