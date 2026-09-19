# 30 — .tex paragraph position tags (S2SS3P4L128)

Status: resolved (2026-09-18, main; code commits a86ff2d module(editor) + 5382b28 web(core))

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

- **Overlay** (`web/src/texPosTags.ts`) — a ViewPlugin recomputes a
  DecorationSet of `Decoration.line` on every doc change (and when the setting
  flips). Each tagged line gets class `tex-pos-tag` plus a `data-tag`
  attribute; styles.css paints the marker as a `::before` pseudo-element:
  taupe at low contrast (`rgba(188,177,160,.35)`), mono type at 0.62em,
  `user-select: none`. The tag is never document content — compilation,
  search, and the saved file are unaffected (verified by an edit → autosave →
  read-back round trip).

- **Toggle** (`EditorPane.tsx`) — "Paragraph position tags" in the editor gear
  menu, default on; the plugin is added for .tex files only. The setting rides
  the same live-dispatch path as spell check, so toggling applies without a
  view recreation.

## Verification

Done (2026-09-18): harness `test-latex-project/pos_tags_test.mjs` — 20/20:

- Structure pass (esbuild-bundled `latexStructure.ts`, Node 22): nested
  fixture with section/subsection/subsubsection maps all 11 text paragraphs
  exactly; heading lines untagged; starred + short-arg headings, commented-out
  `\section`, `\paragraphmark` non-match, and `\paragraph` counter reset all
  behave; multi-line heading titles consume the whole run; empty doc → no tags.
- CDP (headless Chrome :9333 against the live app): exactly one tag per text
  paragraph with values matching the structure pass; `::before` carries the
  tag text in taupe mono, unselectable; the paragraph's DOM text is untouched;
  the second source line of a multi-line paragraph carries no tag; edit →
  autosave → read-back round trip proves tags never enter the saved file and
  decorations recompute live after typing; toggling off removes all tags and
  persists `posTags=false` to localStorage, toggling back restores the set.

## Comments

Claimed & implemented 2026-09-18 (issue 30 session). Decisions: heading runs
carry no tag (the heading is already a location marker; P would be ambiguous
on a heading); P also resets on \subsubsection and \paragraph headings so tags
stay fine-grained for navigation; default on for .tex files. Click-to-jump is
a later refinement per the original note.
