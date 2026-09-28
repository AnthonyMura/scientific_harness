# 41 — Red refresh button after a project change (stale-tree affordance)

Status: resolved (2026-09-28; minkota office machine, WSL2)

## Request

User request (2026-09): after changing the project via the top-bar project
buttons (Open… / New… / Recent…), the Explorer's **refresh button should turn
red** — sometimes the explorer tree is not up to date after a project change,
and a red refresh button tells the user what to do.

## Design

- A `explorerStale` flag in the shared app context (App.tsx owns it).
- Set on every successful top-bar project change: `pickRecent`,
  `doOpenProject`, `createNew`. Not set on boot — the first load is fresh.
- Cleared when the Explorer completes a full reload with a successful root
  listing: the manual refresh click, but also the other full-reload paths (a
  `treeTick` bump from Save version / Save As in the PDF pane, and the
  show-hidden toggle), since those genuinely re-list everything.
- The Explorer's refresh button gets a `stale` class while the flag is set:
  error-red icon + tinted background (the theme's existing danger palette)
  plus a tooltip change ("Tree may be out of date — click to refresh").

Why the flag survives the automatic reload on switch: switching projects
remounts the Explorer and re-lists the root, but the tree is still "new" from
the user's point of view — expanded folders are reset, and anything that
changed on disk between the switch and the listing (external edits, generated
output) is not in the tree. The red button is the explicit "click me to be
sure" affordance; it stays until a full reload settles it.

## Implementation

- `workbench/web/src/modules/ctx.ts` — `explorerStale: boolean` +
  `clearExplorerStale()` on AppCtx.
- `workbench/web/src/App.tsx` — flag state; set in pickRecent / doOpenProject
  / createNew after a successful open/create; exposed via ctx (stable
  callback).
- `workbench/web/src/components/FileExplorer.tsx` — `reloadAll()` now resolves
  true when the root listing succeeded and clears the flag then; the refresh
  button renders the `stale` class + tooltip while the flag is set.
- `workbench/web/src/styles.css` — `.head-actions button.stale` (error-red
  icon, tinted background, stronger border).

## Verification

CDP verified 2026-09-28 on the office machine (Vite :5199 + sidecar :8765 +
headless Chrome :9333, two projects: A = test-latex-project, B = stale-test-b).
Harness: `/home/minkota/code/test-latex-project/cdp_stale_refresh_test.mjs` —
14/14 checks passed:

- C1: fresh boot load leaves the refresh button neutral (no `stale` class,
  default "Refresh tree" tooltip, base icon color).
- C2: picking project A from the top-bar "Recent…" select turns the button red
  — `stale` class, tooltip "Tree may be out of date - click to refresh",
  computed icon color rgb(177, 121, 117) (theme `--err`) on the tinted
  background rgba(123, 22, 18, 0.35) (`--err-tint`).
- C3: clicking the red refresh button clears the stale state (class, tooltip
  and color all revert).
- C4: re-picking the same project from Recent… turns it red again — the flag
  is set on every top-bar project change, including A→A where nothing else
  changes.
- C5: a second refresh click clears it again.
- C6: with the tree cached, a file created on disk is absent until a manual
  refresh re-lists the root — the button's red state and its click genuinely
  track "tree may be out of date → click to be sure".

Production build clean: `tsc --noEmit` + `vite build` (2026-09-28).
