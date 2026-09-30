# 45 — Remove an entry from recent projects (per-item control in the picker)

Status: resolved (2026-09-30)
Module: app-shell

## Request (user)

"recent project history needs function to remove recent as toggle on a right
from name" — each entry in the Recent projects list should be removable, with
the affordance sitting at the right end of the item's name.

## Behavior (expanded description)

- The top bar's **Recent…** picker (`ProjectBar.tsx`) lists up to 20 recently
  opened/created projects, most recent first. Today there is no way to drop a
  stale entry — the list only grows until the cap of 20 evicts the oldest.
- Each row in the picker gets a small **remove** control (× button) at the
  right end of the project name, revealed on hover (always visible on touch).
  Clicking it removes that one entry from the recent list; nothing else happens
  — the project folder on disk is untouched.
- The currently open project may or may not be removable while open — see open
  questions. Default proposal: hide the control for the current project (its
  re-insertion on every `open_project` call would make removal feel broken).
- Removal is immediate, no confirm dialog: it only edits history, and a wrong
  click costs one future "Open…" from the folder dialog.
- The updated list persists across sidecar restarts (recents live in global
  state, not in memory alone).

## Implementation notes

- **Frontend**: `ProjectBar.tsx` currently renders a native `<select>` for
  recents — options cannot host buttons, so the picker must become a custom
  dropdown (button + anchored menu, same pattern as `ProjectSettingsMenu`),
  each row = name + hover-revealed remove button. Keep the `onPickRecent(p)`
  prop; add an `onRemoveRecent(p)` callback in `App.tsx`, which calls the API
  and updates the existing `recent` state in place (no full refetch needed).
- **Backend**: new endpoint, e.g. `DELETE /api/projects/recent/{project_id}`
  (or POST variant) in `app.py`, token-gated like everything else; a small
  function in `projects.py` filters `st["recent_projects"]` by id and writes
  back via `st.set`. Ids are absolute root paths, so URL-encode the path in
  the route (or accept an encoded query/body instead — decide at claim time).
- **API client**: add the method next to `recentProjects()` in `web/src/api.ts`
  (line ~66).

## Open design questions (decided at claim time)

- Remove control for the currently open project: **hidden** (the default
  proposal). Its re-insertion on every `open_project` call would make removal
  feel broken; the row is still there and picking it is a no-op.
- Native `<select>` replacement vs. separate "manage recents": **custom
  dropdown** (button + anchored menu, same pattern as `ProjectSettingsMenu`).
  The per-name × only works with a custom menu.
- Cap/eviction note: **trigger tooltip** reads "Recent projects (keeps the
  last 20)".

## Verification plan (executed 2026-09-30)

CDP suite over headless Chrome (`--headless=new`, `Input.dispatchMouseEvent`
for real hover/click, `Runtime.evaluate` probes) against the Vite dev server
:5199 + sidecar :8765. Seeded state with two scratch projects plus
`test-latex-project` (opened last, so it is the current project); original
`state.json` backed up and restored afterwards.

All 16 checks passed:
- app boots with the seeded current project; trigger opens the dropdown;
  picker lists all three seeded entries in order.
- × control **absent** on the current project's row.
- hovering a row reveals its × (computed opacity 0 → 1); an unhovered row's ×
  stays hidden (opacity 0).
- clicking × removes exactly that entry — the other rows remain, the menu
  stays open; the removed project's folder is untouched on disk.
- picking a remaining entry opens it (top bar name updates), the menu closes,
  and the picked entry re-enters at the front of the list (its × now hidden,
  since it is current).
- **restart persistence**: killed and relaunched the sidecar; after a page
  reload the removed entry is still gone and the remaining entries survive.

Note: port :9333 was already bound by a leftover headless Chrome from the
issue-43 session, so the suite drove that existing instance instead of a fresh
profile (same app + sidecar; only the browser profile differed). No check
depends on localStorage, so results are unaffected.

## Related

- #42 — Git module (unrelated, just next open ticket)
- `ProjectBar.tsx` / `App.tsx` — picker + recents state
- `projects.py` `open_project()` — re-inserts into `recent_projects[:20]`

## Comments

New ticket (2026-09-30); idea from user: per-entry remove in the recent
projects picker, control at the right of each name.

Resolved 2026-09-30: custom dropdown replaces the native `<select>` (button +
anchored menu, `ProjectSettingsMenu` pattern); rows carry a hover-revealed ×
(always visible on touch) that calls `POST /api/projects/recent/remove {id}` —
POST variant chosen because every other route is GET/POST/PUT and ids are
absolute paths full of slashes. Backend `projects.remove_recent()` filters the
list by id, 404s on a miss, persists via `st.set`; `App.tsx` syncs `recent`
from the returned list (no refetch) and mirrors the backend's re-insert-at-front
in `pickRecent`. Typecheck + production build clean; 16-check CDP suite green
including restart persistence (see Verification plan). The user's real recents
were backed up before seeding and restored afterwards.
