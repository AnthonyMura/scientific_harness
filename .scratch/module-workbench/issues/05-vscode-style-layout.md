# 05 — VSCode-style split-tree layout

Status: resolved

## Scope
Replace the fixed four-area layout with a recursive tree of splittable groups
so modules can be arranged exactly like in VSCode: any group can be split
horizontally or vertically, any tab can live in any group, and dropping a tab
near a pane's bottom/right edge creates a new pane there.

## Implementation
- `web/src/modules/layout.ts` — rewritten: `LayoutState { nodes, rootId, tabs,
  homes, focusedGroup, lastEditor, fullscreen }`. Nodes are either `group`
  (ordered tab list + active) or `split` (dir h/v, children a/b, ratio).
  Actions: open (slot/home targeting), activate, focus, close, move, split
  (optionally carrying the dragged tab), removeGroup (empty groups only),
  resize (clamped 0.15–0.85), fullscreen, retab, resetTabs, resetLayout.
  Persistence key `workbench.layout.v3` validates tree integrity (children
  exist, no cycles, ratio bounds) and falls back to the default template.
- `web/src/modules/defs.ts` — `defaultArea` replaced by
  `slot: "sidebar" | "editor" | "panel"`.
- `web/src/components/Workbench.tsx` — rewritten: recursive `NodeView`,
  draggable dividers (double-click resets to 50/50), per-pane split buttons
  (right / down), × on empty panes removes them, drag-to-edge pane creation
  (26 px edge zone with a gold indicator line), tab insertion index from the
  pointer position over the strip, file drops open the editor in the target
  pane, Ctrl+W closes the focused pane's active tab, Esc exits fullscreen.
- `web/src/icons.tsx` — SplitRightIcon, SplitDownIcon.
- `web/src/styles.css` — split-tree / divider / group styles, edge indicator
  line, fs-exit button.
- `web/src/App.tsx` — active file derived from `layout.lastEditor`.

## Default template
root = vertical split [ horizontal split [sidebar (Explorer) | editor
(empty)], bottom panel (empty strip) ]. Run Log / PDF / Install open into
the bottom panel by default; `homes` remembers where the user last placed
each module, so the activity bar reopens it there.

> Updated: opening a project now shows the Explorer only — no file is opened
> automatically (see issue 22).

## Verification
`tsc --noEmit` clean; vite build OK; reducer unit tests (25 assertions):
slot opening, split-with-tab, sidebar split + log move below explorer, empty
group removal with sibling promotion, resize clamping, retab, home-based
reopen, persistence round-trip, corrupt-payload fallback — all pass.
