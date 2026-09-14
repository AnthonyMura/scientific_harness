# 12 — Interactive layout freedom (VSCode-grade drag & drop)

Status: resolved

## Scope

The split-tree layout (issue 05) made panes and tab moves possible, but the
interaction fell short of VSCode: no live reflow while dragging, empty panes
gave no drop feedback (they looked unfillable), splits could only land
right/below a pane, and there was no direct way to place a module into an
empty pane. The end state — closing every window — had no defined look either.
This ticket closes the gap: full freedom of template organization in the main
container, VSCode-style.

## Implementation

- `web/src/modules/layout.ts` — the `split` action gains `side: "before" |
  "after"` (new pane left/top vs right/below) and `withModuleId` (a module
  dragged from the activity bar opens in the fresh pane — or moves there if a
  tab for it is already open). New exported `pathToGroup(nodes, rootId,
  groupId)` returns the split chain from the root down to a group's parent
  (cycle-guarded; null for unknown groups); `MODULE_DRAG_MIME` added.
- `web/src/components/Workbench.tsx` — drag state now covers tab drags and
  activity-bar module drags alike. While a drag hovers a pane, preview ratios
  grow the hovered branch to 62% of its parent at every split on its path, so
  neighbouring panes glide aside in real time (CSS transition, active only
  while dragging). Dropping near any of the four pane edges creates a new
  pane on that side — a gold edge line shows which side will be chosen;
  dropping elsewhere inserts into the hovered pane. Empty panes light up as
  drop targets ("Drop “Run Log” here"); the tab insertion indicator now also
  renders after the last tab; activity-bar items are draggable module
  sources (click still opens/focuses); the tab menu gained "Reset layout to
  default"; the × on an empty pane is hidden for the root group (the reducer
  refuses to remove it anyway). A Newton quote — "If I have seen further it is
  by standing on the shoulders of Giants" (letter to Robert Hooke, 1675) —
  renders as a quiet background layer behind every pane; panes are slightly
  translucent and empty panes fully transparent, so with all windows closed
  the quote and the activity bar remain.
- `web/src/styles.css` — `.wb-quote` layer + stacking above it, translucent /
  empty group backgrounds, `.drop-target` highlight for empty panes, four
  edge-line variants (top/bottom/left/right), `.tab.drop-after`, reflow
  transitions while dragging, grab cursor on the activity bar.

## Verification

`tsc --noEmit` clean; vite build OK. Reducer sanity script (21 assertions):
split before/after placement, `withModuleId` open + move into a fresh pane,
move into an empty group with home update, `pathToGroup` chain integrity and
unknown-group handling, removeGroup promotion and root protection, and
close-all-tabs leaving the empty groups — all pass. HMR verified serving the
updated modules at 127.0.0.1:5199 (no restart needed).
