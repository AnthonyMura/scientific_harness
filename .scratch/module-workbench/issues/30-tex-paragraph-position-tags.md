# 30 — .tex paragraph position tags (S2SS3P4L128) — BACKLOG

Status: open (requested 2026-09-18; not claimed, not scheduled)

## Idea (user)

Before every paragraph in the .tex editor, show non-clickable, transparent
marker text like `S2SS3P4L128`: S = section number, SS = subsection number,
P = paragraph number within the subsection, L = line number. The point is to
see at a glance where in the document you are — jumping between different
parts of a long manuscript becomes much more convenient with such a tag system.

## Notes for whoever claims this

- Tags must be **overlay/decoration only** (CodeMirror decorations or a
  gutter), never document content — they must not affect compilation, search,
  or the saved file.
- Requires a LaTeX structure pass: walk `\section`/`\subsection`/
  `\subsubsection`/`\paragraph` headings with line numbers to build the
  S/SS/P/L mapping; counter resets per parent section.
- "Transparent, not clickable" → low-contrast (taupe-ish) styling, no pointer
  events; a later refinement could make them click-to-jump.
- Should have an on/off toggle in editor settings (see also #31).

## Verification plan

TBD at claim time: structure-pass harness over a sample document with nested
sections; CDP check that tags render before the right paragraphs and never
enter the saved text.

