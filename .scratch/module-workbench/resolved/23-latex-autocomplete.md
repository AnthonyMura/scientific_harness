# 23 — LaTeX autocomplete overlay (Overleaf-style)

Status: done
Module: editor
Target files: `workbench/web/src/latexCompletions.ts` (new), `workbench/web/src/components/EditorPane.tsx`

## Request

LaTeX has many commands that are hard to remember. The editor needs an
autocomplete + helper overlay for `.tex` / `.sty` / `.cls` files: when the
user starts typing `\be`, the overlay shows `\begin`; using it — mouse click,
arrow keys + Enter, or Tab — completes the command. Picking `\begin` leads to
an environment-name picker whose selection inserts the full paired block
including the `\end{env}` operator. Analogue: Overleaf's autocomplete system.

## Scope (as shipped)

- Completion source for LaTeX files only (StreamLanguage "latex" branch of
  `langForPath`), registered through
  `EditorState.languageData.of(() => [{ autocomplete: latexCompletionSource }])`
  — the source must be a bare function in that object; wrapping it in an array
  makes `asSource` treat it as a completion list and the widget never opens.
- Two completion contexts:
  - **Command names** (`\` + letters at the caret): ~260 curated commands in
    7 sections, each with a short detail line. All sections use
    `rank: "dynamic"` — static numeric ranks impose −1e5-per-position shifts
    that dominate fuzzy scores and freeze section order; dynamic ranking lets
    best-member score (plus per-command `boost` for frequent commands) decide.
    Commands with arguments insert a template with the caret in the first slot
    (`\section{}` etc.) via a custom function `apply` (CM6 string applies
    cannot position the caret; `$0` marker is handled manually).
  - **Environment names** inside an open `\begin{…}` / `\end{…}`, and after a
    bare `\begin` / `\end` typed without braces (Overleaf behavior — the name
    picker opens immediately, selection inserts the braces): ~45 environments
    with details. Picking one after `\begin` inserts the full paired block —
    `\begin{env}`, an indented middle line (lists get an `\item `), and
    `\end{env}` on the original indentation, caret on the middle line. After
    `\end` only the name completes; environments still open in the document are
    listed first (boosted) so mismatched closes are easy to avoid.
- **Cascade**: picking `\begin` / `\end` re-opens the picker at the new caret
  position via `autocompletion({ activateOnCompletion })`, giving the
  Overleaf-style two-step flow in one continuous gesture.
- Selection works with mouse click, arrows + Enter, and Tab. Tab needed an
  explicit binding: this @codemirror/autocomplete version's default keymap has
  no Tab entry, so `{ key: "Tab", run: acceptCompletion }` is placed before
  `indentWithTab` in the EditorPane keymap (falls through to indent when the
  widget is closed).
- Overlay styled to the Vesper palette via an `EditorView.theme` extension
  (`latexCompletionTheme`): raised surface, hairline border, section headers,
  muted detail text, gold matched prefix.

## Out of scope (v0)

- Multi-field snippets (single caret slot is enough for v0).
- Math-mode-aware symbol lists beyond the curated set.
- Package-aware completion (only what a standard document uses).
- Autocomplete for markdown files.

## Verification (done 2026-07, headless Chrome over CDP)

Full CDP suite (`cdp_autocomplete_test.mjs`, dev server Vite :5199 + sidecar
:8765, test project with a `main.tex`) — **16/16 checks pass**:

- [x] typing `\sect` shows a tooltip; top item is `\section`; Tab inserts
      `\section{}` with the caret inside the braces (no env picker after it)
- [x] typing `\be` shows `\begin` on top; Tab inserts `\begin{}` and re-opens
      the picker with environment names; typing `al` + Tab inserts the full
      `\begin{align}…\end{align}` block with an indented middle line and the
      caret on it
- [x] arrows + Enter (`\te` → two ArrowDowns → `\textrm`) and mouse click
      (`\fr` → click → `\frac`) also apply completions
- [x] Esc closes the overlay without inserting anything (`\eq`, `\end`)
- [x] bare `\end` opens the env picker with the innermost open environment
      first, marked "currently open"
- [x] final on-disk document (via autosave + sidecar read) contains the
      expected inserted blocks and no stray text
- [x] `tsc --noEmit && vite build` clean (WSL, Node 22)

## Implementation notes (bugs found while verifying)

1. `languageDataAt("autocomplete")` collects `result["autocomplete"]` per
   provider object — an array value is misread by `asSource` as a completion
   list; register the source as a bare function.
2. This CM autocomplete version's default keymap has no Tab binding; bind
   `acceptCompletion` explicitly before `indentWithTab`.
3. Static section ranks dominate fuzzy scores (−1e5 per section position);
   use `rank: "dynamic"` + targeted `boost` values instead.
4. `String.match()` without `/g` returns an array — `baseIndent.length` was
   the array length (always 1), shifting the env-block caret one line down;
   take `[0]` of the match.
5. The `indentUnit` facet defaults to two spaces, not a tab — middle-line
   indentation mirrors that unless an extension overrides it.