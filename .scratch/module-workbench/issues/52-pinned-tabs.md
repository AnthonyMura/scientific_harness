# 52 — Pinned tabs: keep a tab (e.g. the .tex section) fixed at the front of its strip

Status: needs-triage
Machine: home

## Request (user)

"pinned tabs, for example, i work with .tex section and many different notions.
I want to pin tab with .tex and move it above other tabs. Jetbrains pycharm has
this option"

## Current state

- No pin concept: `Tab` (`workbench/web/src/modules/layout.ts:12–17`) carries
  only id / moduleId / title / params, and strip order is open order (see #51).
  The right-click `TabMenu` (Workbench.tsx:546) offers only "Close".
- A user juggling one main .tex section with many note files has no way to keep
  the section tab first while notes open and close around it.

## Requirements

1. Pin / unpin a tab from the right-click `TabMenu` (and/or a pin affordance on
   the tab itself); pinned state persists with the layout.
2. Pinned tabs render at the front of their pane's strip, before all unpinned
   tabs; within each section order is unchanged (open order / #51 moves).
3. Visual distinction for pinned tabs (pin icon, tighter title), PyCharm-style:
   the tab stays first while other tabs open, close and reorder around it.

## Implementation notes

- Add `pinned?: boolean` to `Tab` (layout.ts:12) and carry it through
  `persistLayout` / `loadPersistedLayout` (key `workbench.layout.v3`,
  layout.ts:488–560); old persisted layouts simply have no `pinned` — no
  migration needed.
- The strip maps `group.tabs` in raw order (Workbench.tsx:312, 433). Two
  options: sort pinned-first at render time (less invasive) or keep the stored
  order pinned-first by reordering in the reducer (honest for drop-index math);
  decide at claim time.
- Interaction with #51 moves: moving a pinned tab into the unpinned region (or
  vice versa) should either unpin it or keep pinning by position — decide at
  claim time.

## Open questions

- Does pinning imply only "kept at front + compact", or also keep-alive /
  no-auto-close semantics? (PyCharm: front + compact, nothing more.)
- Pin is a property of the tab but the ordering effect is per-pane — confirm
  that is the intended scope.

## Related

- #51 — Tab reorder (same strip UI; likely one branch)
- `workbench/web/src/modules/layout.ts` — Tab type, reducer, persistence
- `workbench/web/src/components/Workbench.tsx` — TabView / TabMenu

## Comments

New ticket (2026-09-30); user request quoted above.
