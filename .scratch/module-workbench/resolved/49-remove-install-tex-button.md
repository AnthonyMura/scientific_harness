# 49 — Remove the "Install TeX" button from the top bar

Status: resolved (2026-10-01, main; commit 242af7e app: remove Install TeX button from top bar)
Machine: home

## Request (user)

"One more ticket is about removing button 'INSTALL TEX' in right top angle of
window. It is useless. We do not need it anymore."

## Current state

- `workbench/web/src/components/ProjectBar.tsx:118-120` — the button, far
  right of the project bar (top-right corner of the window):
  `<button onClick={onToggleInstall} className={showInstall ? "active" : ""}>Install TeX</button>`
- Props declared at ProjectBar.tsx:19-20 (`showInstall`, `onToggleInstall`).
- Wiring in `workbench/web/src/App.tsx:728-729`: `showInstall={false}` is
  already hardcoded (the "active" state never renders); `onToggleInstall`
  dispatches `{ type: "open", moduleId: "install" }`.
- The target module stays registered regardless of the button:
  `workbench/web/src/modules/defs.ts:24`
  (`install: { id: "install", title: "Install TeX", slot: "panel", ... }`)
  rendered by `workbench/web/src/components/InstallPanel.tsx`; ctx channel at
  `workbench/web/src/modules/ctx.ts:76`.
- Backend side: `workbench/backend/workbench_backend/install.py` +
  `tinytex.py install()` (#06) — in-app TinyTeX install/update via
  `POST /api/install/run {"target":"tinytex"}`.

## Scope (open question for triage)

- **Minimal**: remove only the button from ProjectBar (+ its two props,
  ProjectBar.tsx:19-20 and App.tsx:728-729). The install module stays
  reachable if a layout opens it.
- **Full**: also unregister the `install` module (defs.ts, registry.tsx,
  InstallPanel.tsx, ctx channel) and retire the `/api/install*` endpoints —
  declaring the in-app TinyTeX fully self-maintaining via #06's on-demand
  repair.
- Either way: how does a user update/repair the in-app TinyTeX afterwards?
  Options: keep the module reachable from project settings, rely on
  auto-repair at compile plus a reinstall hint in error messages, or accept
  updates only via `tlmgr update --self` during a future install flow. Decide
  at triage.

## Verification plan

- Top bar no longer shows the button (CDP text/DOM check).
- If full scope: no "Install TeX" panel in any layout, including saved layouts
  referencing `install` — confirm how registry/layout validation treats an
  unknown module id and that it degrades gracefully.
- Compile still auto-repairs missing packages (#06 path untouched);
  `tsc --noEmit` + vite build clean.

## Related

- #06 — In-app TinyTeX (the install flow this button opens; on-demand repair
  is the replacement)
- `docs/workbench_v0_plan.md` — progress note if triage removes the Install
  module entirely

## Comments

New ticket (2026-09-30); user request quoted above.

**Scope decision (2026-10-01, at claim): MINIMAL.** Remove only the top-bar
button (`ProjectBar.tsx` button + its `showInstall` / `onToggleInstall` props)
and the two prop lines in `App.tsx`. Rationale:

- The user's request is specifically about the button ("useless. We do not need
  it anymore."), not about retiring the Install module.
- The install module stays registered (`workbench/web/src/modules/defs.ts`) so
  saved layouts that reference `install` keep working; full scope would first
  require verifying graceful degradation of such layouts, which was not done.
- The module remains reachable from the UI without the top-bar button: the
  "TeX missing — install" affordance in `ProjectSettingsMenu.tsx` opens it via
  `ctx.onShowInstall`, and any layout can include the panel.

**Updating/repairing the in-app TinyTeX afterwards:** the Install TeX panel is
still openable from a layout (module registration unchanged); #06's on-demand
auto-repair at compile adds missing packages automatically; a full TinyTeX
update remains available through the panel (`POST /api/install/run` with
`target: "tinytex"`), just no longer surfaced in the top bar.
