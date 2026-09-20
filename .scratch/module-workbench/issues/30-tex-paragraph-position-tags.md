# 30 — .tex paragraph position tags (S2SS3P4L128)

Status: resolved (2026-09-18, main; code commits a86ff2d module(editor) + 5382b28 web(core)); refined 2026-09-20 per user feedback (2d652f5 module(editor) + adb3e46 web(core))

## Idea (user)

Before every paragraph in the .tex editor, show non-clickable, transparent
marker text like `S2SS3P4L128`: S = section number, SS = subsection number,
P = paragraph number within the subsection, L = line number. The point is to
see at a glance where in the document you are — jumping between different
parts of a long manuscript becomes much more convenient with such a tag system.

## Design

- **Structure pass** (`web/src/latexStructure.ts`) — pure function over the
  source text. A "text paragraph" is a maximal run of non-blank lines (LaTeX
  treats blank lines as paragraph breaks); comment-only lines count as blank.
  Walks `\section`/`\subsection`/`\subsubsection`/`\paragraph` headings (star
  and `[short title]` forms included; a following letter disqualifies, so
  `\paragraphmark{…}` is not a heading) with line numbers:
  - S — \section number, 1-based; 0 for content before the first section
  - SS — \subsection number, resets on every \section
  - P — text-paragraph number within the current subsection; resets on
    \subsection, \subsubsection, and \paragraph headings
  - L — absolute line number of the paragraph's first line

  Heading runs advance the counters but carry no tag — the heading itself
  already says where you are.

- **Overlay** (`web/src/texPosTags.ts`) — a StateField recomputes a
  DecorationSet on every doc change (and when the setting flips) and provides
  `EditorView.decorations` via `Facet.from(field)` — not `.of(fn)`: in
  @codemirror/view 6.43 any function-provided decoration set is "dynamic" and
  block decorations inside it throw ("Block decorations may not be specified
  via plugins"), while `from()` computes a concrete set per state, which is
  allowed. Two decorations per tagged paragraph:
  - a **block point widget** (`side: -1`) at the line start — the marker
    renders on its own visual line *above* the paragraph's first line (user
    feedback: the original inline `::before` shifted text rightward and was
    too small). The widget DOM splits the tag into bold-prefixed groups —
    `S1 · SS1 · P2 · L24` with `<b>` letter prefixes (weight 600) and faint
    middot separators; `data-tag` keeps the compact form.
  - a **line decoration** (`tex-pos-line`) on the tagged line itself: a faint
    taupe tint plus a 2px left accent, so marker and paragraph read as one
    unit.
  Styling (styles.css): taupe at low contrast (`rgba(188,177,160,.45)`), mono
  type at 0.9em, `user-select: none`. The tag is never document content —
  compilation, search, and the saved file are unaffected (verified by an edit
  → autosave → read-back round trip).

- **Toggle** (`EditorPane.tsx`) — "Paragraph position tags" in the editor gear
  menu, default on; the plugin is added for .tex files only. The setting rides
  the same live-dispatch path as spell check, so toggling applies without a
  view recreation.

## Verification

Done (2026-09-18; re-verified 2026-09-20 after the above-line refinement) — harness
`test-latex-project/pos_tags_test.mjs`, 22/22:

- Structure pass (esbuild-bundled `latexStructure.ts`, Node 22): nested
  fixture with section/subsection/subsubsection maps all 11 text paragraphs
  exactly; heading lines untagged; starred + short-arg headings, commented-out
  `\section`, `\paragraphmark` non-match, and `\paragraph` counter reset all
  behave; multi-line heading titles consume the whole run; empty doc → no tags.
- CDP (headless Chrome :9333 against the live app): exactly one tag per text
  paragraph with values matching the structure pass; the marker sits strictly
  above the paragraph's first line (widget rect bottom ≤ line rect top) in
  taupe mono at ≥12px, unselectable; the tag is split into bold-prefixed
  groups S/SS/P/L (weight 600, three separators); the tagged line itself
  carries the faint `tex-pos-line` highlight; the paragraph's DOM text is
  untouched; the second source line of a multi-line paragraph carries no tag;
  edit → autosave → read-back round trip proves tags never enter the saved
  file and decorations recompute live after typing; toggling off removes all
  tags and persists `posTags=false` to localStorage, toggling back restores
  the set. (Note: the harness runs Chrome at 1600×2400 — with block widgets
  adding a visual line per tag, the default 900px viewport virtualizes the
  last paragraphs out of the DOM.)

## Comments

Claimed & implemented 2026-09-18 (issue 30 session). Decisions: heading runs
carry no tag (the heading is already a location marker; P would be ambiguous
on a heading); P also resets on \subsubsection and \paragraph headings so tags
stay fine-grained for navigation; default on for .tex files. Click-to-jump is
a later refinement per the original note.

Refined 2026-09-20 (user feedback: "font should be bigger and it should be above line
of paragraph start. Not at the same shifting line to right", plus a follow-up
asking for more visibility and split/bold counters). The inline `::before`
marker became a block line widget on its own line above the paragraph's first
line (StateField + `Facet.from`, see Design), 0.9em taupe; the tag now reads
as bold-prefixed groups `S1 · SS1 · P2 · L24`, and the tagged line itself
carries a faint tint + left accent (`tex-pos-line`). Code: 2d652f5
module(editor), adb3e46 web(core). Harness extended to 22/22 (T3a above-line
geometry, T3f bold groups, T3g line highlight); screenshot re-captured.
