# 14 — Editor cursor: palette red, shapes, smooth motion, gear settings

Status: resolved (re-verified 2026-09-14 after the drawSelection fix)

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
- `web/src/components/EditorPane.tsx` — the view extensions include
  `drawSelection()`: without it CodeMirror never renders its own `.cm-cursor`
  element (only the browser's native caret is visible), so none of the cursor
  CSS below has anything to style. The same theme also gives text selection
  palette colors (sand tint, replacing the base theme's gray/lavender) and
  forces `caret-color: transparent` on `.cm-content` — including the focused
  state, where drawSelection's own rule would restore a native caret in the
  text color.
- `web/src/modules/settings.ts` + `SettingsMenu.tsx` — `SettingControl` gains
  an optional `visibleWhen: { key, value }`: rows declared with it render only
  while that other setting matches (a sub-setting). The editor uses it for the
  new `cursorLineWidth` number control (1–6 px, step 0.2, default 1.2), shown
  only while Cursor type is `line`; EditorPane applies it live as the
  `--cm-cursor-w` CSS var and `styles.css` picks it up via
  `.editor-pane[data-cursor="line"] .cm-cursor { border-left-width: ... }` —
  scoped so block/underline keep their 1ch box.
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

Re-verification (2026-09-14): the user reported no red cursor after the first
pass — root cause was the missing `drawSelection()` above (the styled element
simply did not exist). Verified with a headless Chrome CDP session against
127.0.0.1:5199: real mouse click focuses the editor, exactly one `.cm-cursor`
element renders with computed `border-left-color: rgb(123, 22, 18)` (brick),
the native caret computes to transparent, and a keyboard selection paints
`rgba(179, 143, 111, 0.32)` (palette sand).

Line-width sub-setting (2026-09-14): CDP check — with `cursorLineWidth: 4` the
focused `.cm-cursor` computes to `border-left-width: 4px` in brick; the gear
menu shows "Cursor line width" while Cursor type is `line` and hides it for
`block`/`underline`; the value persists to localStorage.
