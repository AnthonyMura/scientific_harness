# Vesper Design Guide — Every Part of the Software

> **Status:** normative component guide for Workbench (the Electron/web UI).
> Companions: `app_palette.md` (the nine anchors), `app_theme.md` (concept, surface-derivation rule, type scale, contrast table).
> **Source of truth for values:** `workbench/web/src/styles.css` (`:root` block). If this guide and the CSS ever disagree, fix both together — never hardcode a hex value in a component.

## 1. How to use this guide

- Building or changing any part? Find its section below (or the closest existing pattern), reuse its classes and tokens, then run the checklist (§7).
- Authority order: `app_theme.md` says *why* (concept) → this guide says *what each part is* → `styles.css` says *the exact values*.
- The theme has exactly one look. There is no light mode, no second accent, no alternative style for a "special" surface.

## 2. Global rules (apply to every part)

1. **Frame.** `.app` is a grid: `48px / 1fr / 200px` (top bar / main / run log). `.main` is `240px / 1fr / 1fr` (explorer / editor / PDF). The page never scrolls; each pane scrolls internally (`min-height: 0` on flex children, `overflow` on the inner scroll region).
2. **Surface ladder.** Five steps: `--bg-base #191412` → `--bg-pane #201A17` → `--bg-raised #251E1A` → `--bg-hover #29221E` → `--bg-active #2E2621`. Depth = one step up + a hairline. If a surface looks "off", recompute from the derivation rule in `app_theme.md` §3 instead of nudging hexes.
3. **Borders.** Default hairline `rgba(sand, .14)`; strong `rgba(sand, .35)` for inputs and modal/drawer edges. The 40% sand line under the top bar is a signature and exists in exactly one place. Never solid brown borders.
4. **Text hierarchy.** `--text-1` pearl = content; `--text-2` taupe = secondary/labels; `--text-3` brown = tertiary, hints, disabled. Sand never carries body text — it is a detail color.
5. **Statuses.** ok = sand, warn = `#944C3C` (rust), err = `#B17975` on `--err-tint`. There is no green, blue, or purple in this app.
6. **Radii.** 2px for controls, 3px for cards. Nothing rounder than a status dot.
7. **Focus.** `:focus-visible` = 1px sand (.6) outline, 1px offset. Every interactive part must show it on keyboard focus.
8. **Motion.** v0 is static; the only transitions are 120ms background/color/border on controls. Future motion: ≤150ms, opacity/transform only, honor `prefers-reduced-motion`. Nothing glows or pulses.
9. **Empty state.** `.pane-empty` — one or two sentences in `--text-3`, 12.5px, no icons, telling the user what to do next.
10. **Errors.** Local failures stay local: `.tree-error` strip at the top of a pane's content (err text, pre-wrap). Cross-cutting failures (backend unreachable, project open/create failed) go to the `.banner`. Fatal job errors surface in the run log's `.log-errors` strip.
11. **Selection & scrollbars.** `::selection` = sand 28%. Scrollbars thin, thumb sand 25%, transparent track.

## 3. Parts — current software

### 3.1 App frame (`.app`, `.main`)

The skeleton: top bar (48px), three-column main row, run log (200px). Panes are separated by 1px hairlines on their right edge; the PDF pane has no right border (it is the last column). The editor pane sits one step darker than its neighbors (`--bg-base` vs `--bg-pane`) — the manuscript is the deepest, quietest surface in the app.

### 3.2 Top bar / project bar (`.topbar`)

Left-to-right order: **brand → Open… New… → Recent… select → project name → spacer → dev badge → Install TeX → Compile | Cancel**.

- `.brand` "Scientific Harness": Cormorant Garamond 600, 12.5px, uppercase, letter-spacing .3em, pearl. It is a wordmark, not a heading — never italicize, enlarge, or recolor it.
- `Open…` / `New…`: ghost buttons (§3.3).
- `select` "Recent…": raised background, strong hairline, taupe text; the placeholder option is "Recent…". Selecting an entry opens that project immediately.
- `.proj-name`: taupe, ellipsized at 260px, `title` carries the full path, preceded by a **6px sand dot** — the only decorative dot in the bar. The dot means "a project is open".
- `.badge` "browser dev mode": 10px uppercase, ls .12em, gold text on transparent with a .35 hairline border. Informational only — badges never carry status (status belongs to chips, §3.9). Shown in browser dev mode only; absent in the Electron shell.
- **Signature line:** `border-bottom: 1px solid rgba(sand, .4)` — the one 40% border in the app.
- Action slot: exactly one primary action at the right end. It is `Compile` (`.primary`, disabled until a project is open). While any job runs it becomes `Cancel` (`.danger`) — never two primaries side by side, never a second red.

### 3.3 Buttons (all parts)

All buttons: Inter 600, 11px, uppercase, ls .08em, radius-sm, 120ms transitions. The small-caps vocabulary is part of the identity — no sentence-case buttons.

| Class | Fill | Border | Text | Hover | Use |
|---|---|---|---|---|---|
| *(default, ghost)* | transparent | sand .25 | taupe | `--bg-hover` + pearl text | secondary actions (Open…, New…, Save, Refresh, ✕) |
| `.primary` | brick | none | pearl | crimson fill | the single primary action of a view (Compile, Create, Open, Install now) |
| `.danger` | `--err-tint` | none | err | brick .5 tint | cancelling a running job — destructive, but not alarming |
| `.mini` | ghost, 10px, padding 3/9 | sand .25 | taupe | as ghost | pane-header actions (Save, Refresh, ✕, Cancel in log) |
| `.active` | ghost + gold text | sand .5 | gold | as ghost | toggle state (Install TeX while the drawer is open) |

Disabled: opacity .45, no pointer. A disabled button keeps its shape — it never disappears.

### 3.4 Selects and inputs

- `select`: raised background, strong hairline, 12px taupe, radius-sm, padding 6/8.
- `input`: **base** background (darker than the surface it sits in — inputs are wells), pearl text, brown placeholder, 13px, strong hairline. Inside modals inputs switch to mono 12.5px — project names and paths are data, not prose.
- Focus: the global `:focus-visible` ring; no per-control focus styles.

### 3.5 File explorer pane (`.explorer`)

- Nameplate `.pane-header` "Explorer": Inter 600, 10px, uppercase, ls .16em, brown, hairline bottom. Every pane has exactly one nameplate — it is the pane's identity.
- `.tree-scroll`: internal scroll region, padding 4px 0.
- `.tree-row`: 12.5px taupe; indent `8 + depth*14` px; hover → `--bg-hover` + pearl text. Directory rows show a brown ▸/▾ glyph and a trailing slash; file rows show the bare name. No icons beyond the triangle, no bold anywhere in the tree.
- **Active file** (`.tree-row.file.active`): `--bg-active` background, pearl text, and the **2px sand left rule** — the app's signature selection treatment. Any future "current item" highlight reuses this exact pattern.
- Errors: `.tree-error` at the top of the scroll region. No project open: `.pane-empty` line pointing at Open…/New….

### 3.6 Editor pane (`.editor-pane`)

- Nameplate row: file path + status dot + Save button.
- `.dot`: 7px circle. Clean = sand .35 (quiet, "saved"); dirty = warn rust (attention, "unsaved"). Never red — an unsaved buffer is not an error.
- Save: `.mini` ghost, disabled until dirty; Mod-s works in the editor regardless.
- **CodeMirror canvas** (`.cm-editor`): Palatino Linotype 14px, line-height 1.7, text pearl at 88% (soft, not stark), pearl caret, active line sand 6%, gutter mono 10.5px brown with a hairline right border, `padding-bottom: 40vh` so the last lines can breathe.
- **Syntax colors** (`vesperTheme.ts`) — the editor's only palette:

| Token | Color | Treatment |
|---|---|---|
| Structural commands (`\documentclass`, `\section`, `\begin`/`\end`, …) | `#C3A893` gold-bright | weight 600 — the document skeleton glows |
| Other commands | `#B38F6F` sand | plain |
| Comments | `#8D7564` brown | italic |
| Brackets & punctuation | `#BCB1A0` taupe | plain |

  New language modes must map onto this same four-color scheme (skeleton → gold-bright, commands → sand, comments → brown, delimiters → taupe). No other hues in the editor.
- Load/read errors: `.tree-error` strip above the canvas.

### 3.7 PDF viewer pane (`.pdf-pane`, `.pdf-host`)

- `.pdf-host`: centered column, padding 16px, gap 14px.
- **The page canvas is pearl `#F2F1ED` — the brightest surface in the app**, the "paper" against which everything else recedes. Warm shadow: `0 2px 12px rgba(maroon, .35)` plus a 1px strong-hairline ring; radius 1px. pdf.js must be told to render with `background: "#F2F1ED"` (its default white breaks the theme).
- No UI chrome over the page. Status text (rendering/missing) goes below it in `.muted`.
- Empty: `.pane-empty` ("No PDF yet — press Compile.").

- Citation markers (`.pdf-cite`, issue 26): visible link-styled boxes over each `[n]` group in the text layer — a quiet sand tint `rgba(179,143,111,.12)` with a 1px sand underline at rest, deepening to a `.35` wash on hover (radius-sm, 120 ms); clicking one jumps to the reference entry. Sand is the link token (§4), so citations read as links without a new hue; gold-bright stays editor-only.
- Citation tooltip (`.pdf-cite-tip`, issue 27): a small fixed card shown ~200 ms after the pointer rests on a `.pdf-cite` marker — raised bg, strong hairline, radius-md, shadow-pop, interactive (`pointer-events: auto`, `user-select: text`) so the pointer can rest on it to select/copy and follow DOI links (issue 35), z-40; positioned at cursor +(12,16), flipped above the cursor near the viewport bottom, clamped horizontally. Content top → bottom: title pearl Inter 12.5/600 (max 2 lines), authors taupe 12px (max 2 lines), `doi: …` mono 11.5 sand with break-all only when known — a clickable link to `https://doi.org/<doi>` (new tab) when it matches the DOI pattern, plain text otherwise (issue 35) — or the raw entry text as printed in the PDF's own References section, clamped to ~4 lines, when no structured data is available. Group citations render one such block per reference — hairline separator between entries, capped at six with a muted '… plus N more' line (issue 34). Leaving the marker or the card starts a short grace period (200 ms) so crossing onto the card keeps it alive; scroll / click / re-render hide it at once; moving between adjacent citations swaps content in place. Instant show/hide (v0 motion rule: no animation); data absence is not an error state — no chip.
- Back pill (`.pdf-back-pill`): absolute top-left of the pane (top 44 px — below the 32 px header plus 12 px inset, left 12 px, z-20), raised bg, strong hairline, radius-sm, Inter 600 10px uppercase in taupe with a sand ✕ — the mini-button vocabulary. Label `← back to [3] · p. 2`; appears after a citation jump, dismissed by ✕ / Escape / a new jump / any re-render.
- The sync flash (`.pdf-sync-flash`) doubles as the jump highlight: sand `.35` wash with a sand ring and soft glow over the target line, `pointer-events: none`, fades out after ~1.6 s — it never intercepts clicks.
### 3.8 Run log panel (`.log-panel`)

Fixed 200px bottom row, pane background, hairline top border.

- Nameplate: "Run log" when idle; `kind · label` (e.g. "compile · compiling classic") while a job exists, plus its **chip** (§3.9). `Cancel` mini danger appears only while running.
- `.log-errors` strip (when the job has parsed errors): `--err-tint` background, err text, max 64px with its own scroll, hairline bottom — errors surface above the raw stream.
- `.log-scroll`: mono 12px, line-height 1.8, taupe; lines matching error/undefined-control-sequence/fatal get `.err` color; auto-scrolls to the bottom as lines arrive.
- `.artifacts`: one line in sand (`--ok`) at the very bottom — success is gold, never green.

### 3.9 Status chips (`.chip`)

The **only** status vocabulary in the app. Inter 600, 10px, uppercase, ls .1em, padding 2/8, radius-sm.

| State | Look | Meaning |
|---|---|---|
| base | raised bg, brown text | neutral ("unavailable") |
| `.running` | transparent, gold text, .35 border | work in progress |
| `.done` | raised bg, sand text | success |
| `.error` | `--err-tint` bg, err text | failure |
| `.cancelled` | raised bg, warn rust text | stopped by the user |

Do not add chip colors. Do not use badges for status. A new status that doesn't fit these five is a sign the state model is wrong, not the palette.

### 3.10 Install TeX drawer (`.install-overlay`)

A **drawer, not a modal**: fixed right edge, 470px wide (max 90vw), pane background, strong hairline left border + soft left shadow, z-60 — no scrim, the app stays visible and usable.

- Nameplate row: "Install TeX" + `Refresh` mini + `✕` mini.
- `.card` per target: raised bg, hairline, radius-md, padding 12px. Title row = pearl 600 name + chip on the right ("TeX found" / "missing" / "unavailable"). Detail in `.muted`; version in muted mono; missing packages as a warn-rust list with inline `<code>` pills (raised bg); install hint in brown 12px.
- `.cmd` block: base background, hairline, mono 11.5px taupe — commands read like editor text, not buttons.
- Actions row right-aligned: optional distro `select` + one primary "Install now".
- `.card.ok`: border sand .5 — the quiet all-good state (paired with the done chip).
- While an install runs: cards stay put, a muted line at the bottom points to the run log. **The run log is the single source of job progress** — no second spinner system.

### 3.11 Modals — New project / Open project (`.modal-backdrop`, `.modal`)

- Backdrop: ink scrim 60%, z-70, click closes.
- `.modal`: 420px raised card, strong hairline, radius-md, `--shadow-pop` — one of the only three parts allowed a true drop shadow (modal, drawer edge, PDF page).
- Nameplate + `.modal-body` (padding 14, gap 10): full-width mono input (autoFocus), one `.muted` hint sentence, `.card-actions` right-aligned: ghost `Cancel` + primary `Create`/`Open`, disabled until the field is valid. Enter submits.
- Keep modals to one field + hint + actions. Anything richer belongs in a drawer or pane.

### 3.12 Error banner (`.banner`)

Fixed bottom-center, z-80 (topmost): `--err-tint` background, brick border, err text, 12.5px, click dismisses. For cross-cutting failures only — local problems stay in their pane (§2.10). One banner at a time; a new error replaces the old one.

## 4. Color usage policy

Who may use what:

| Color | Allowed uses | Forbidden uses |
|---|---|---|
| brick `#7B1612` | the one primary action per view, banner border | large-area fills, text |
| crimson `#710014` | hover of brick only | anything else |
| burgundy / maroon | tints (`--err-tint`), warm shadows | text, borders at full strength |
| sand `#B38F6F` | focus rings, active rules, links (incl. PDF citation markers + back pill), success status, LaTeX commands, dots | body text |
| gold-bright `#C3A893` | editor skeleton tokens, dev badge | outside the editor (badge is the one exception) |
| pearl `#F2F1ED` | primary text, PDF page, caret/cursor | fills other than the paper |
| taupe `#BCB1A0` | secondary text, delimiters, log stream | primary content |
| brown `#8D7564` | tertiary text, line numbers, comments, disabled, nameplates | anything the user must read quickly |

Contrast floors: primary text ≥ 7:1 (pearl on base ≈ 15:1), secondary ≥ 4.5:1 (taupe), tertiary may sit around 3–4:1 (brown) but only for hints and line numbers; err/warn must stay clearly legible on their tints.

Banned everywhere: green/blue/purple hues, pure `#000`/`#fff` (use ink/pearl), reds outside the five anchors, saturated accents of any kind, glow or pulse effects.

## 5. Typography quick reference

| Part | Face | Size / weight | Color |
|---|---|---|---|
| Wordmark | Cormorant Garamond | 12.5px / 600, uppercase, ls .3em | pearl |
| Pane nameplate | Inter | 10px / 600, uppercase, ls .16em | brown |
| Badge / chip | Inter | 10px / 600, uppercase, ls .1–.12em | per state (§3.9) |
| Buttons | Inter | 11px / 600, uppercase, ls .08em (mini: 10px) | taupe → pearl on hover |
| UI body | Inter | 13px / 400 | pearl / taupe |
| Hints (`.muted`) | Inter | 12px / 400 | brown |
| Tree rows | Inter | 12.5px / 400 | taupe → pearl on hover/active |
| Editor text | Palatino Linotype | 14px, lh 1.7 | pearl @88% + syntax table (§3.6) |
| Gutter / log / commands | mono | 10.5–12px | brown (gutter), taupe (log, `.cmd`) |

The division of labor: **serif = identity and writing** (wordmark, manuscript), **sans = UI chrome**, **mono = machine data** (paths, logs, versions, commands). Fonts load from Google Fonts with Palatino/Georgia fallbacks; the editor deliberately uses system Palatino so the manuscript never depends on the network.

## 6. Future surfaces — v3 modules in Vesper

From `docs/technical_description_v3.md`. When these modules are built they must follow the patterns below, not invent new ones.

- **Split-pane rewrite editor.** Two `.editor-host` columns inside the editor pane, divided by a 1px strong hairline. Both surfaces stay `--bg-base` — the manuscript never gets chrome. Nameplate: source path on the left column; "rewrite" + a chip (running/done) on the right. The active-file sand rule moves to the nameplate dot.
- **LaTeX profiles.** A drawer of `.card`s (install-panel pattern), or tree rows if it lives beside the explorer. The active profile gets the **sand left rule** (the `tree-row.active` pattern). Profile metadata as muted mono lines; "in use" as a done chip.
- **Zotero references.** Explorer-style tree on the left + preview `.card` on the right inside one pane. Citation keys as inline `<code>` pills. "Attached to document" = done chip; sync problems = error chip, details in a `.tree-error` strip.
- **Student data intake.** A form grid in a drawer (or modal for short forms): field labels in nameplate style (10px small-caps brown), inputs per §3.4, section breaks as hairline rules. Validation failures as `.tree-error` strips under the offending group; required markers in err color — never red asterisks on sand.
- **LLM conductor chat.** Message cards: user = raised background; assistant = pane background with strong hairline. Model/role label = chip (running while streaming). Chat text is Inter 13px — never serif for conversation. Quoted manuscript fragments get a raised block with the 2px sand left rule and editor-serif text.
- **Research parser results.** Expandable rows like tree rows; each result a `.card` with a confidence chip (done/running/error mapping) and extracted fields as label/value pairs in muted mono.

General rule for every future part: reuse the nameplate + surface ladder + chips + one-primary vocabulary. New panes get a `.pane-header`. Anything floating is either a **drawer** (470px right edge, no scrim) or a **modal** (scrim, 420px). There is exactly one selection treatment — the sand left rule — and one job-progress system — the run log.

## 7. Checklist — adding or changing a part

1. **Pattern first.** Does an existing part already do this? Clone its classes before writing new CSS.
2. **Tokens only.** No raw hex in components. A genuinely new value is derived per `app_theme.md` §3 and added to `:root` with a comment explaining the derivation.
3. **One nameplate per pane, one primary action per view, status via chips only.**
4. **All states exist:** default / hover / selected-or-active / disabled / loading / empty / error — each must be describable in this guide (add it when you add the part).
5. **Keyboard:** natural tab order, visible `:focus-visible` ring, Enter submits modals, Escape closes drawers/modals (v1 item), Mod-s saves.
6. **No new radii, shadows, colors, or motion** beyond §2.
7. **Verify.** `npm run build` clean → serve through the sidecar at `http://127.0.0.1:8765/` → headless-Chrome CDP screenshot at 1400×900 → pixel-sample key points (top bar ≈ `#201A17`, primary button = `(123,22,18)`, PDF page = `(242,241,237)`, editor canvas = `(25,20,18)`). `app_theme_screenshot.png` (repo root) is the current ground truth.
8. **Update §3** of this guide with the new part before the change ships.

## 8. References

- `app_palette.md` — the nine anchor colors and their roles
- `app_theme.md` — concept, surface derivation rule, type scale, contrast table, token block, implementation notes
- `workbench/web/src/styles.css` — exact values (source of truth)
- `workbench/web/src/vesperTheme.ts`, `src/latexMode.ts` — editor syntax mapping
- `app_theme_screenshot.png` — verified rendering of the current UI