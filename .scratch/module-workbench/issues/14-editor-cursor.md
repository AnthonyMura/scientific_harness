# 14 — Editor cursor: palette red, shapes, smooth motion, gear settings

Status: claimed

## Scope

The editor's text cursor should read as the Vesper accent (brick from the
palette), and its look and motion should be user-configurable from the editor
gear popover ("Editor settings"):

- **Red cursor** — brick (`--brick`, the palette's accent red), not pearl.
- **Smooth animation** — when the cursor moves (typing, arrows, clicks,
  reverse-sync jumps) it glides to the new position instead of teleporting;
  toggleable.
- **Cursor type** — selectable shape: `line` (thin vertical bar, default),
  `block` (translucent brick cell over the current character), `underline`
  (brick rule under the current character).

## Implementation

- `web/src/modules/settings.ts` — `SettingControl` gains `kind: "select"` with
  an `options` list; `SettingValue` widens to include strings.
- `web/src/components/SettingsMenu.tsx` — renders a compact `<select>` for
  select controls (persisted like the other values via `useModuleSettings`).
- `web/src/components/EditorPane.tsx` — new editor settings: `cursorType`
  (select, default `line`) and `smoothCursor` (toggle, default on). Applied
  live as `data-cursor` / `data-smooth` attributes on `.editor-pane` — no view
  recreation, so switching shapes or motion never reloads the file.
- `web/src/styles.css` — cursor rules keyed off those attributes: brick line
  (was pearl), block = brick at 55% over one `ch`, underline = 2px brick
  bottom border; smooth motion = 90ms transition on the cursor's inline
  `left`/`top` (CodeMirror repositions it there; blink is a layer opacity
  animation, so the two don't fight). Disabled under
  `prefers-reduced-motion`.

## Verification

`tsc --noEmit` clean; vite build OK. Manual check at 127.0.0.1:5199: gear →
Editor settings shows Cursor type + Smooth cursor motion; switching shape and
motion applies live to the open file; cursor is brick in all three shapes;
arrow keys / clicks glide when smooth is on, snap when off.
