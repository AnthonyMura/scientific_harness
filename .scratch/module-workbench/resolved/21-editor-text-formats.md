# 21 — Text file formats in the editor: open + highlight common text types

Status: ready-for-agent

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