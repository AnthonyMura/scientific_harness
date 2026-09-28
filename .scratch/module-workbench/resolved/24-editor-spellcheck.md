# 24 — Editor spell check: red underline, on/off toggle, dictionary select

Status: resolved (2026-09-18; branch `feature/editor-spellcheck`, commits e96f5e8..5f337ef)

## Scope

The editor checks word spelling while you type. A misspelled word gets a
red wavy underline. The feature can be turned on and off, and the dictionary
is selectable — for now the 10 most popular languages, English first and
Russian second:

en (English), ru (Russian), es (Spanish), fr (French), de (German),
pt (Portuguese), it (Italian), tr (Turkish), pl (Polish), nl (Dutch).

The catalog is one constant (`web/src/spellcheck/dictionaries.ts`); adding a
language later is a one-line change. Spell check applies to every file the
editor opens (LaTeX commands — words right after a backslash — are skipped,
so `\mycommand` in a .tex file is not flagged).

## Design

- **Engine** — `hunspell-wasm` (WebAssembly port of Hunspell, LGPL tri-license)
  runs entirely in the browser; no backend changes. The emscripten loader would
  otherwise resolve its 811 KB `hunspell.wasm` relative to its own module URL —
  inside Vite's deps directory in dev, a 404 — so the app initializes the factory
  directly with `locateFile` pinned to `/hunspell.wasm`; an npm `postinstall`
  script copies the binary from `node_modules/hunspell-wasm/wasm/` to
  `web/public/hunspell.wasm` (gitignored; Vite serves it in dev and build alike).
- **Dictionaries** — wooorm's normalized hunspell packages (`dictionary-en`,
  `dictionary-ru`, …) are Node-only at runtime, but their `index.aff` /
  `index.dic` files ship in the npm tarball and jsDelivr serves them with CORS
  enabled. The web app fetches the pair for the selected language on demand
  (a few hundred KB to ~1 MB each) and caches it in IndexedDB
  (`workbench.spellcheck.v1`), so each dictionary downloads once per browser.
- **Checker service** (`web/src/spellcheck/checker.ts`) — one Hunspell instance
  per language, kept in memory; `getChecker(lang)` resolves
  fetch → cache → WASM and caches the promise (a failed load is evicted so the
  next attempt retries). Tokenization: words are runs of letters/digits/
  apostrophes (`\p{L}[\p{L}\p{N}'’]*`, Unicode); a word is accepted if Hunspell
  accepts it as-is or lowercased (covers capitalized starts in dictionaries
  without case folding).
- **UI** — CodeMirror `StateField<DecorationSet>` + `ViewPlugin`: on document
  change (debounced ~250 ms) or on toggle/language switch the plugin recomputes
  decorations — one `Decoration.mark({ class: "sp-misspelled" })` per misspelled
  range. CSS gives the brick wavy underline (`text-decoration: underline wavy
  var(--brick)`). The editor gear menu gains a **Spell check** toggle (default
  on) and a **Dictionary** select (sub-setting, visible while spell check is on;
  default English). Both persist via the existing `useModuleSettings`. While the
  selected dictionary is still downloading, a small "dictionary…" note sits in
  the pane header; a failed download shows an error note and checking stays off
  until the next attempt.

## Implementation steps (one commit each)

1. **Plan** — this ticket. Commit: `docs(scratch): …`.
2. **WASM plumbing** — `npm i hunspell-wasm`; `postinstall` script copies the
   wasm into `web/public/`; `.gitignore` entry. Commit: `module(editor): …`.
3. **Checker service** — `src/spellcheck/dictionaries.ts` (catalog + URLs),
   `src/spellcheck/cache.ts` (IndexedDB), `src/spellcheck/checker.ts`
   (instance registry + tokenization). Commit: `module(editor): …`.
4. **Editor integration** — `src/spellcheck/decorations.ts` (StateField +
   ViewPlugin), EditorPane wiring (settings controls, header status note),
   red-squiggle CSS in `styles.css`, `visibleWhen` type widening for boolean
   parents in `modules/settings.ts`. Commit: `module(editor): …`.
5. **Docs** — README status line, plan progress note, ticket verification +
   resolved status. Commits: `docs(readme)`, `docs(workbench)`,
   `docs(scratch)`.

## Verification

- `tsc --noEmit` and `vite build` clean (2026-09-18; pre-existing chunk-size warning only).
- All 10 dictionary URLs (jsDelivr, `index.aff` + `index.dic`) return HTTP 200.
- Headless Chrome CDP at 127.0.0.1:5199 against a scratch project with planted
  typos — all pass:
  - EN default: exactly the planted words flagged — `jumpss` plus the Russian line
    (`Привет`, `мир`, `это`, `тест`); `\mycustomcmd` (LaTeX command) and every correct
    English word unflagged.
  - Gear menu → Spell check off: marks cleared immediately; back on: restored.
  - Dictionary → Russian: `Привет` no longer flagged, `jumpss` still flagged, result set
    changed (the English sentence is now "misspelled" to the RU dictionary).
  - IndexedDB `workbench.spellcheck.v1` holds `en.aff`, `en.dic`, `ru.aff`, `ru.dic`.
  - localStorage `settings.editor`: `spellcheck: true`, `spellLang: "Russian"` after the switch.

## Comments

CDP verification caught four integration bugs that code review missed, each its own
commit: the emscripten loader's dev-mode wasm 404 (fixed with a `locateFile` pin),
a label-vs-code mixup at the EditorPane boundary (`dictionary-English` 404), the
`StateField` missing its `provide()` clause (marks dispatched but never rendered),
and the plugin never seeing setting changes because a React toggle dispatches no
CodeMirror transaction (fixed with an empty `view.dispatch({})` on change).
