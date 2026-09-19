# 37 — Commit button after .tex edits (in-app git commit)

Status: needs-triage

**Before implementation work on design.** No design decided yet — this ticket is a placeholder for the feature request only.

## Request

User request (2026-07): after adding modifications to a `.tex` file in the
editor, there should be a **commit button with a sentence** (the commit
message) right there in the UI. The motivation: not wanting to open a terminal
every time just to type `git commit -m "..."`.

## Open design questions (to resolve before implementation)

- Where does the button live? Editor toolbar, status bar, or project/explorer
  area? Visible always, or only when there are staged/unstaged changes?
- What does it commit — just the edited `.tex` file, all dirty files, or a
  diff-selected subset?
- Message UX: pre-filled sentence (e.g. auto-generated from the change), plain
  input field, or both? Where is the message remembered for the next commit?
- Staging model: `git add` + `git commit` in one step, or explicit stage/commit
  separation? What about untracked new files?
- Backend surface: new sidecar endpoint(s) for status/diff/stage/commit vs.
  reusing an existing shell-out path. How are git errors surfaced (log panel?)?
- Non-git projects / detached HEAD / merge conflicts — what should the UI show?

## Comments

(placeholder ticket; design discussion to be appended here before work starts)
