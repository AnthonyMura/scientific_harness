# 15 — PDF pane opens to the right of the editor on compile

Status: resolved

## Scope

When a compile starts (auto-compile on save of main.tex, or a manual
compile), the PDF preview pane should appear **to the right of the active
editor**, not in the bottom panel where the generic "open" flow places it.

## Implementation

- `web/src/modules/layout.ts` — `groupOfTab` is now exported so the shell can
  locate which group holds a given tab.
- `web/src/App.tsx` — new `openPdfPane()` used by `beginJob` for compile jobs:
  - target group = the group holding the most recently active editor tab
    (`lastEditor`), falling back to the focused group;
  - if the pdf tab is already the right-hand sibling of that group in a
    horizontal split — just focus it (no layout churn on every save);
  - otherwise dispatch `split` with `dir: "h"`, `side: "after"` and
    `withModuleId: "pdf"` (fresh pane) or `withTabId: "pdf"` (move the existing
    pane there, collapsing the group it leaves behind).

## Verification

`tsc --noEmit` clean; vite build OK. Headless E2E against 127.0.0.1:5199 with
the test project (auto-compile on): Ctrl+S in main.tex — persisted layout gains
a split `{dir: "h", a: "g-editor", b: <new group>}` where the new group holds
the pdf tab (right of the editor); the PDF page element renders in the right
region. A second save after the compile settles leaves the pdf group and split
count unchanged — no move, no duplicate pane.
