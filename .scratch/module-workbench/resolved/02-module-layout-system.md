# 02 — Module layout system (VSCode-style areas, tabs, drag & drop)

Status: resolved

## Scope
Replace the fixed three-pane grid with a module workbench: activity bar + four
areas (sidebar / center / right / bottom panel), draggable tabs, resizers,
fullscreen, persisted layout.

## Implementation
- `web/src/modules/defs.ts` — `MODULE_DEFS` registry: explorer (sidebar, singleton),
  editor (center, multi, tab id `editor:<filePath>`), pdf ("PDF Preview", right,
  singleton), log ("Run Log", panel, singleton), install (right, singleton).
- `web/src/modules/layout.ts` — `LayoutState` + `layoutReducer`:
  open / activate / close / move / resize / collapse / fullscreen / resetTabs /
  retab (rename remaps an editor tab id in place). Width clamps:
  sidebar 160–480, right 240–720, panel 90–520. Moving a tab into a collapsed
  area un-collapses it.
- `web/src/modules/ctx.ts` — shared `AppCtx` handed to every module render.
- `web/src/components/Workbench.tsx` — activity bar (focus + open), tab strips
  with close × and dot menu (Close / Move to… / Fullscreen), HTML5 drag & drop
  between tabs and areas with drop indicators, mouse-drag resizers with
  double-click collapse, fullscreen area + Esc exit, Ctrl/Cmd+W closes the
  active center tab.
- `web/src/App.tsx` — layout `useReducer`, persistence to localStorage
  (`workbench.layout.v1`) keyed by project root; on boot keeps a persisted
  layout only when it belongs to the same project; `activeFile` derived from
  the active center editor tab; explorer delete/rename callbacks close or
  retab editor tabs.

## Verification
`tsc --noEmit` clean; `vite build` succeeds (71 modules); every module compiles
through the dev server at 127.0.0.1:5199.
