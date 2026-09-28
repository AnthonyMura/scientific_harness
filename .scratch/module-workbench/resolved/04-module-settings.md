# 04 — Per-module settings (gear popover)

Status: resolved

## Scope
Every module gets a gear in its pane header opening a settings popover;
settings persist per module in localStorage (`workbench.settings.v1`).

## Implementation
- `web/src/modules/settings.ts` — `useModuleSettings(moduleId, defaults)` hook.
- `web/src/components/SettingsMenu.tsx` — portal popover with number steppers
  (− value +) and On/Off toggles; viewport clamping; Esc / outside click close.
- Settings per module (schema lives with the component, shared with the registry):
  - Explorer: font size 10–20 px (default 13), show hidden files (off)
  - Editor: font size 10–28 px (15), line height 1.3–2.4 (1.7), tab size
    2/4/6/8 (4), word wrap (off). Font size / line height apply live via
    `--cm-fs` / `--cm-lh`; tab size and wrap recreate the CodeMirror view.
  - PDF Preview: zoom 50–300 % (125) with −/%/+ header controls
  - Run Log: font size 10–20 px (12) via `--fs-log`
  - Install TeX: no settings yet

## Verification
`tsc --noEmit` clean; all popovers compile through the dev server.
