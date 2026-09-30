# 45 — Remove an entry from recent projects (per-item control in the picker)

Status: needs-triage

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

## Open design questions

- Remove control for the currently open project: hide it, or allow removal and
  accept that the next open re-adds it?
- Native `<select>` replacement vs. keeping the select and adding a separate
  "manage recents" affordance — the per-name × only works with a custom menu.
- Cap/eviction note in the UI (e.g. tooltip "keeps the last 20")?

## Related

- #42 — Git module (unrelated, just next open ticket)
- `ProjectBar.tsx` / `App.tsx` — picker + recents state
- `projects.py` `open_project()` — re-inserts into `recent_projects[:20]`

## Verification plan

TBD at claim time: CDP checks that opening two projects shows both in the
picker, hovering a row reveals the × control, clicking it removes exactly that
row (folder still on disk), the removal survives a sidecar restart, and picking
a remaining entry still opens it.

## Comments

New ticket (2026-09-30); idea from user: per-entry remove in the recent
projects picker, control at the right of each name.
