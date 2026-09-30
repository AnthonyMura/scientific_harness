# 49 — Remove the "Install TeX" button from the top bar

Status: needs-triage
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
