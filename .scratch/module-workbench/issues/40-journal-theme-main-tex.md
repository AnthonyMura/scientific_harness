# 40 — Rewrite main.tex according to a chosen journal theme

Status: needs-triage

**STOP before any implementation work: discuss the design with the author first.**
The author is not yet sure this feature is worth building and plans to spend more
time on design research. Nothing here may be implemented until that discussion has
happened and a design is agreed.

## Request

User request (2026-09): for a `.tex` project whose content lives in a single
`main.tex`, the document should be **rewritten according to the chosen journal
theme** (journal template / LaTeX class). Motivation: manually rewriting and
editing the LaTeX settings — documentclass, packages, margins, heading styles,
bibliography style, … — to match a journal's requirements is complicated for
non-professional users. The feature would change `main.tex` according to a choice
of theme: pick a journal/theme, get the main file adjusted accordingly.

## Open design questions (to resolve with the author before implementation)

- Theme source: where do themes come from — a bundled set of known journal classes
  (e.g. elsarticle, spjcomms, iopart, …), user-provided `.cls`/`.sty` files, or a
  template `.tex` per theme? Where does the theme data live?
- What exactly does "rewrite" mean — replace only the preamble (documentclass +
  packages), also transform body structures (section naming, journal-specific
  environments), and/or swap the bibliography style? How deep should it go?
- One-way rewrite vs. round-trip: can a user switch themes back and forth without
  losing their content edits? Must the rewrite be idempotent / reversible (undo,
  or storing the original)? What happens on re-apply after manual edits?
- Scope gate: "main.tex file only" — does the feature apply only when the project
  has a single `.tex` file, or is `main.tex` simply the file that gets rewritten
  while `\input`/`\include` files stay untouched?
- Implementation approach: the author is unsure whether a Python script (backend
  sidecar) is the right tool. Options to weigh: backend template engine vs.
  frontend transformation vs. letting LaTeX itself do it (class options / a small
  preamble macro).
- Interaction with existing features: project settings already track `main_file`
  (issue 17); compile target, autosave and syncTeX must keep working after a
  rewrite.

## Comments

(placeholder ticket; design discussion to be appended here before work starts)
