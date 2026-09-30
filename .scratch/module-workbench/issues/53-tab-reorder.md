# 53 — Tab reorder: move a tab within its strip without splitting

Status: needs-triage
Machine: home

## Request (user)

"User needs an opportunity to move and shift tabs of windows. For example,
there is a tab with editor, user opens pdf viewer and want to use without split
in tab mode but pdf tab user wants as first, but he opens it after editor.
Needs to move."

## Current state

- Each pane (group) holds an ordered `GroupNode.tabs: string[]`
  (`workbench/web/src/modules/layout.ts:19`); new tabs are appended at the end —
  `open` calls `insertTabAt` with no index (layout.ts:270), so strip order is
  open order.
- The only reorder mechanism today is drag-and-drop: `TabView` sets
  `TAB_DRAG_MIME` on dragstart (`workbench/web/src/components/Workbench.tsx:507`),
  the drop handler derives an insert index from pointer position over
  `.tabstrip` (Workbench.tsx:341–357) and dispatches
  `{ type: "move", tabId, groupId, index }` (Workbench.tsx:386; reducer at
  layout.ts:342–360). Dropping on a pane edge splits instead (Workbench.tsx:385).
- The right-click `TabMenu` (Workbench.tsx:546) offers only "Close".
- Consequence: a user who opens the editor first and the PDF second cannot make
  the PDF tab first except by dragging — which is easy to miss and fiddly in a
  crowded strip.

## Requirements

1. Reorder a tab within its own pane without splitting, via explicit UI:
   right-click menu entries "Move tab left" / "Move tab right" (and/or
   "Move to start" / "Move to end"); drag-drop stays as is.
2. Works for any module tab (editor, pdf, bib, structure, …) in any group.
3. The resulting order persists with the layout (`persistLayout`, localStorage
   key `workbench.layout.v3`, layout.ts:488).

## Implementation notes

- The reducer already does the job: `{ type: "move", tabId, groupId, index }`
  (layout.ts:41) re-inserts at `index` in the same group and keeps the tab
  active — only the UI affordances are missing. Add the menu items in `TabMenu`
  (Workbench.tsx:546), dispatching move with the current index ± 1 (clamped).
- Optional keyboard shortcuts on the focused tab (e.g. Alt+←/→); decide at claim
  time — must not collide with CodeMirror editor keybindings.

## Open questions

- Menu-only, or menu + keyboard shortcuts?
- Should the menu also offer moving a tab to another pane (today that is
  drag-only)?

## Related

- #54 — Pinned tabs (same strip UI; likely one branch)
- `workbench/web/src/components/Workbench.tsx` — TabView / TabMenu / drop logic
- `workbench/web/src/modules/layout.ts` — reducer + persistence

## Comments

New ticket (2026-09-30); user request quoted above.
