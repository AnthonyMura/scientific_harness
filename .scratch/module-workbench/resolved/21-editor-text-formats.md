# 21 — Text file formats in the editor: open + highlight common text types

Status: resolved (2026-09-28; minkota office machine, WSL2)

## Scope

The editor already opens, edits, autosaves and saves-on-close **any** UTF-8 file
(no extension gate exists in `onOpenFile`, `read_file` or `write_file`) — but only
two formats get syntax highlighting (Markdown, LaTeX); everything else renders as
plain text. The 'New File…' picker offers only tex/md/txt, the tree shows a
generic icon for most types, and the backend carries a dead constant
(`EDITABLE_SUFFIXES = {".tex", ".md"}`) plus a 415 message that contradicts
reality ('only .tex/.md text files are editable').

This ticket extends the editor module to first-class support for the common text
file types below: open + modify (already true), per-format highlighting, 'New
File…' picker entries, and tree icons.

## File type list

Tier 1 — core (must):

| Extension(s) | Format | Highlighting |
| --- | --- | --- |
| `.tex`, `.sty`, `.cls` (+`.ins`, `.dtx`, `.ltx`) | LaTeX | existing `latexMode` |
| `.md`, `.markdown` | Markdown | existing `@codemirror/lang-markdown` |
| `.txt` (and extension-less files) | Plain text | none — opens as-is today |
| `.bib` (+`.rbib`) | BibTeX | new stream mode: `%` comments, entry types `{article,...}`, field names, string values in braces/brackets |
| `.json` | JSON | new stream mode (or `@codemirror/lang-json` if we accept the dep): strings, numbers, keywords true/false/null, brackets |
| `.csv`, `.tsv` | Tabular data | none (plain text is fine; optional column guide later) |
| `.log` | Build logs (LaTeX `.log`) | none needed — plain text; read in the editor like any file |

Tier 2 — common config/markup (should):

| Extension(s) | Format | Highlighting |
| --- | --- | --- |
| `.yaml`, `.yml` | YAML | new stream mode: comments, keys, strings, booleans/numbers |
| `.toml` | TOML | new stream mode: `[table]` headers, key = value, comments |
| `.ini`, `.cfg`, `.conf` | INI-style config | new stream mode: `[section]`, key = value, comments |
| `.xml` (+`.svg` opened as text) | XML | new stream mode: tags, attributes, strings, comments/CDATA |
| `.html`, `.htm` | HTML | reuse the XML mode |

Tier 3 — code & data scripts (later, only if asked):

| Extension(s) | Format | Notes |
| --- | --- | --- |
| `.py` | Python | scientific data scripts |
| `.r`, `.R` | R | scientific computing |
| `.ipynb` | Jupyter notebook | JSON; a real cell view is a separate feature — for now it opens as plain JSON text |
| `.sh`, `.bat` | Shell scripts | |
| `.bst` | BibTeX style | reuse the BibTeX mode |
| `.rst` | reStructuredText | scientific docs |

Binary files stay refused by the backend's UTF-8 decode check (415) — no change.

## Implementation plan

- `web/src/textModes.ts` (new) — lightweight `StreamLanguage` modes for BibTeX,
  JSON, YAML, TOML, INI, XML/HTML, following the existing `latexMode.ts` pattern
  (no new npm dependencies; token classes from the Vesper highlight set).
- `web/src/components/EditorPane.tsx` — extend `langForPath()` with the
  extension→mode map above (currently md/tex only); everything unmatched keeps
  falling back to plain text.
- `web/src/components/FileExplorer.tsx` — grow the `FILE_TYPES` 'New File…'
  picker: LaTeX document, Markdown note, Plain text, BibTeX bibliography, JSON,
  CSV data table (+ keep 'Other… (custom name)').
- `web/src/icons.tsx` — `entryIcon()` gets dedicated colored icons for `.bib`,
  `.json`, `.csv`/`.tsv`, and the Tier 2 config/markup extensions.
- `backend/workbench_backend/files.py` — remove the dead `EDITABLE_SUFFIXES`
  constant; reword the 415 message to 'binary file; only UTF-8 text files can be
  opened in the editor'.

## Verification

- `tsc --noEmit` clean; vite build OK.
- Headless CDP against 127.0.0.1:5199 with a test project containing one file
  per Tier 1 type: each opens via explorer click, shows highlighted tokens (probe
  `.cm-line` token classes), edits + autosave persist to disk; 'New File…' offers
  the new types and creates correctly suffixed files; tree rows show the new icons.

## Resolution

- `web/src/textModes.ts` (new): five hand-written `StreamLanguage` modes —
  BibTeX, JSON, YAML, TOML, INI, XML/HTML — following the `latexMode.ts` pattern
  (Lezer tags only; zero new npm dependencies). `.ipynb` deliberately stays plain
  text (Tier 3 note: a real cell view is a separate feature).
- `EditorPane.langForPath()` maps every Tier 1 + Tier 2 extension to its mode;
  unmatched extensions fall back to plain text.
- `vesperTheme.ts`: six markdown tag styles added (heading, strong, emphasis,
  monospace, link, quote) — palette-only, no new hues — because lezer-markdown
  emits tags the old five-entry table left unstyled; LaTeX output verified
  byte-identical before/after.
- `FileExplorer.FILE_TYPES`: picker now offers LaTeX document, Markdown note,
  Plain text, BibTeX bibliography, JSON, CSV data table + 'Other… (custom name)'.
- `icons.tsx`/`styles.css`: dedicated icons — database (.bib/.rbib), braces
  (.json), table (.csv/.tsv), sliders (yaml/yml/toml/ini/cfg/conf), code
  (xml/svg/html/htm) — coloured sand / gold-bright / brown / taupe / err.
- `backend/files.py`: dead `EDITABLE_SUFFIXES` removed; 415 reworded to 'binary
  file; only UTF-8 text files can be opened in the editor'.

Verified 2026-09-28 (minkota office machine, WSL2): `tsc --noEmit` clean, vite
build OK, tokenizer unit test green. Headless Chrome CDP suite against a fixture
project with one file per Tier 1 + Tier 2 type — **44/44 checks**: every file
opens via explorer double-click; token highlighting asserted per-character on
computed styles (keyword sand rgb(179,143,111), special gold-bright
rgb(195,168,147) weight 600, comment brown-italic rgb(141,117,100), brackets/
strings taupe rgb(188,177,160)) — per-character probing is required because the
spellchecker wraps tokens in `sp-misspelled` spans that fragment class-based
probes; plain files (.txt/.csv/.log) show zero styled characters; Tier 1 edits
autosave to disk (sentinel + marker read back via sidecar); 'New File…' creates
`.json`/`.bib` on disk; all new tree icons render.

Observation for a future ticket: `FileExplorer.load()` has no request token, so
a stale boot-time tree fetch can briefly show the previous project's rows when a
project is switched within ~1 s of page load (the CDP suite had to wait for a
fixture-unique row name rather than a row count). Cosmetic, pre-existing, out of
scope here.