# Vesper — Single Theme for Scientific Harness

> **Status:** design spec. Companion to `app_palette.md`. Applies to Workbench v0 (`docs/workbench_v0_plan.md`).
> Interactive preview: open `app_theme_preview.html` in a browser and slide the ambient light from bright room to dark room — the theme itself never changes. That is the point.

## 1. Concept

**One theme, no mode switch.** It is named **Vesper** — dusk, the hour between day and night.

The brief: a single theme that works in both light and dark situations. Instead of picking white or black and adapting, Vesper sits *between*: a deep warm base (ink warmed toward oxblood) carrying pearl text and gold-sand details.

Why it holds up in both rooms:

- **Bright room** — the app reads as rich espresso/oxblood: intentional and premium, not "broken dark mode". Surface layers have enough lift that the UI does not collapse into one flat black rectangle, and hairlines plus sand details catch the light.
- **Dim room** — base luminance is very low (≈0.75% relative), so it is comfortable at night; pearl text keeps contrast ≥ 8:1 everywhere it matters.
- **One token set** — no mode-switch bugs, one design review, every component has exactly one look.

The luxury direction comes from restraint: warm dark base, hairline borders instead of shadows, a serif wordmark with wide tracking, small-caps micro-labels, one red family for *action* and one gold family for *attention*. Nothing glows. Nothing is saturated except the brick-red button.

## 2. Palette roles

The nine anchors from `app_palette.md`, each with exactly one job:

| Token | Hex | Name (palette) | Role |
|---|---|---|---|
| `--pearl` | `#F2F1ED` | Soft Pearl | Primary text, icons on dark, PDF page background |
| `--taupe` | `#BCB1A0` | Warm Taupe | Secondary text, inactive labels, muted icons |
| `--sand` | `#B38F6F` | Warm Sand | Gold detail: focus rings, active rules, links, success status, LaTeX commands |
| `--brown` | `#8D7564` | Muted Brown | Tertiary text (line numbers, hints), disabled, editor comments |
| `--brick` | `#7B1612` | Deep Brick Red | Primary action fill (Compile), brand accent |
| `--crimson` | `#710014` | Crimson Depth | Hover state of brick, deep selection tint |
| `--burgundy` | `#6C140E` | Moody Burgundy | Secondary fills, error-tint backgrounds, pressed states |
| `--maroon` | `#51100C` | Very Dark Maroon | Pressed fill, warm shadows, deep tints |
| `--ink` | `#161616` | Ink | Darkest anchor; base of the surface ladder, modal scrim |

**Usage rules.** Reds are for *action and attention only* — never as large-area fills (the app is not a red app). Sand is for *attention without urgency*. Pearl/taupe/brown carry all text.

## 3. Surfaces (derived)

Rule: each surface is **Ink lifted toward Muted Brown, warmed by Very Dark Maroon**; each step lifts ~4–6%. Hex values below are the computed results — if a surface ever looks "off", recompute from this rule rather than nudging the hex.

| Token | Hex | Used for |
|---|---|---|
| `--bg-base` | `#191412` | App background, editor canvas |
| `--bg-pane` | `#201A17` | Side panes: explorer, log, PDF chrome |
| `--bg-raised` | `#251E1A` | Cards, popovers, dropdowns, inputs |
| `--bg-hover` | `#29221E` | Row hover, ghost-button hover |
| `--bg-active` | `#2E2621` | Selected tree row, active tab body |
| `--scrim` | `rgba(22,22,22,.6)` | Modal backdrop (ink at 60%) |

**Borders.** Hairline = `rgba(sand, .14)`; strong = `rgba(sand, .35)`. Borders stay warm-translucent so they read as light on the surface — never solid brown.

**Elevation.** No drop shadows except popovers/modals (`0 8px 24px rgba(0,0,0,.45)`). Depth = one surface step + hairline.

## 4. Typography

Three faces, serif-forward — the product is a writing tool; the UI should feel like the manuscript.

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Brand / display | Cormorant Garamond (fallback: Palatino, Georgia) | 15px / 600, tracking +0.28em, uppercase | Wordmark only: `SCIENTIFIC HARNESS` |
| UI chrome | Inter (fallback: Segoe UI, system sans) | 13px / 400; labels 11px / 600 uppercase +0.12em | All controls, tree, log |
| Editor content | Palatino Linotype / Palatino / Book Antiqua (fallback Georgia) | 14px / 400, line-height 1.7, tab = 4 spaces | `.tex`/`.md` source — mirrors the newpx/Palatino look of the LaTeX default template |
| Log output | ui-monospace / Cascadia Mono / Consolas | 12px / 400 | Terminal lines only |

Scale: **11** (labels) · **13** (UI) · **14** (editor) · **15** (wordmark, pane titles). Nothing larger in v0.

## 5. Shape and spacing

- Radius: **2px** controls, **3px** cards. Sharp, not soft.
- Grid: 8px base; pane padding 12–16px; tree row height 24px.
- Panes are divided by **1px hairlines**, not gutters of raw background — the window is one continuous surface.

## 6. Components (mapped to Workbench v0 panes)

### Project bar (top, 48px)
Wordmark left · project name + main-file select center-left · compile-target select right · **Compile** button far right. A 1px sand hairline runs under the whole bar — the signature line of the app.

- **Compile (primary):** brick fill, pearl text, 2px radius, uppercase 12px +0.08em, padding 8×16. Hover → crimson; pressed → maroon; focus → 1px sand ring, offset 1px. No gradient, no shadow.
- **Ghost button:** transparent, taupe text, hairline border `rgba(sand,.25)`; hover → `--bg-hover` + pearl text.
- **Selects:** raised background, hairline border, 13px, brown chevron; open state = popover with raised bg + pop shadow.

### File explorer (left pane)
- Pane label `EXPLORER`, small caps, brown.
- Rows: 24px, taupe text; hover → `--bg-hover`.
- **Active row:** `--bg-active` + **2px sand left rule** + pearl text. This is the app's signature detail.
- Folders: brown chevron, taupe label — hierarchy by color, never bold weight.
- Icons: 14px line icons in brown; active file's icon and name shift to pearl.

### Editor (center)
- Gutter on `--bg-base`; line numbers brown, 11px, right-aligned.
- Syntax (LaTeX): commands `#B38F6F` · section-level commands (`\section`, `\begin{document}`) `#C3A893` semibold · citation author keys (`\citep{…}` & kin) brick `#7B1612` · braces/arguments taupe · comments brown italic · math `$…$` pearl at 75%.
- **Error line:** background `rgba(123,22,18,.35)` + 2px brick left border + message in `--err`.
- Caret: pearl, 2px. Selection: `rgba(sand,.28)`.

### PDF pane (right)
Chrome on `--bg-pane`; the page renders on **pearl** — the one bright surface in the app, and it is *the artifact*, framed like a print under glass: 1px hairline + warm shadow `0 2px 12px rgba(81,16,12,.35)`. Generous page padding; let the manuscript breathe.

### Log panel (bottom)
- Header row: `COMPILE` small caps · status word in its status color (`SUCCESS` sand / `FAILED` err) · duration and target in taupe.
- Lines: mono 12px, taupe. Warning lines in `--warn`; error lines in `--err` on a brick tint; clickable errors get a sand underline on hover (jump-to-line is the v0 hero interaction — make it obvious).

### Tabs, inputs, toggles
- **Tabs:** active = pearl text + 2px sand underline; inactive taupe; no fill.
- **Input:** raised bg, hairline border, pearl text, brown placeholder; focus = 1px sand ring.
- **Toggle:** track hairline/brown, knob pearl; **on** = brick track (red means *live* — e.g. auto-compile armed).

### Modal
Scrim ink 60% · card on `--bg-raised`, 3px radius, pop shadow · title serif 15px pearl · actions right-aligned: ghost + primary.

## 7. Status and feedback

| State | Color | Use |
|---|---|---|
| Success | sand `#B38F6F` | Compile success, checks |
| Warning | `#944C3C` (derived rust) | Non-fatal log lines |
| Error | `#B17975` text / brick-tint bg | Failed compile, broken links |
| Busy | 2px progress hairline, maroon→sand shimmer (1.2s linear) | Compiling |

**There is no green.** Success is gold — the palette has none, and forcing a green would break the identity. Document this decision if anyone asks.

## 8. Accessibility

Contrast on `--bg-base` (computed, WCAG 2.1):

| Pair | Ratio | Verdict |
|---|---|---|
| Pearl / base | ≈16:1 | AAA |
| Taupe / base | ≈8.6:1 | AAA |
| Sand / base | ≈6.2:1 | AA (normal text) |
| Brown / base | ≈4.2:1 | UI/large only — line numbers, hints; never body text |
| Pearl / brick | ≈9.4:1 | AAA (button label) |
| `--err` / base | ≈5.1:1 | AA |

Focus is always visible: 1px sand ring, offset 1px — crisp, not a glow. Motion: 120ms ease-out hovers; shimmer honors `prefers-reduced-motion` (falls back to static).

## 9. Do / Don't

**Do:** hairlines over shadows · one red moment per screen (the Compile button) · letter-spaced small-caps labels · pearl text on every dark surface · let the PDF's pearl page be the brightest thing in the window.

**Don't:** pure black `#000` or pure white surfaces (except the PDF artifact) · saturated gradients · green/blue status colors · radius above 3px · more than two accent families (red + sand) · brick red as a large-area fill beyond small tints.

## 10. Tokens (CSS, paste-ready)

```css
:root {
  /* Palette anchors — app_palette.md */
  --pearl:    #F2F1ED;
  --taupe:    #BCB1A0;
  --sand:     #B38F6F;
  --brown:    #8D7564;
  --brick:    #7B1612;
  --crimson:  #710014;
  --burgundy: #6C140E;
  --maroon:   #51100C;
  --ink:      #161616;

  /* Derived surfaces — ink lifted toward brown, warmed by maroon */
  --bg-base:   #191412;
  --bg-pane:   #201A17;
  --bg-raised: #251E1A;
  --bg-hover:  #29221E;
  --bg-active: #2E2621;
  --scrim:     rgba(22, 22, 22, .6);

  /* Text */
  --text-1: var(--pearl);
  --text-2: var(--taupe);
  --text-3: var(--brown);

  /* Accent */
  --accent:        var(--brick);
  --accent-hover:  var(--crimson);
  --accent-press:  var(--maroon);
  --gold:          var(--sand);
  --gold-bright:   #C3A893; /* sand + pearl 25% — display moments only */

  /* Lines */
  --hairline:        rgba(179, 143, 111, .14);
  --hairline-strong: rgba(179, 143, 111, .35);

  /* Status */
  --ok:       var(--sand);
  --warn:     #944C3C;
  --err:      #B17975;
  --err-tint: rgba(123, 22, 18, .35);

  /* Type */
  --font-display: "Cormorant Garamond", Palatino, "Palatino Linotype", Georgia, serif;
  --font-ui:      "Inter", "Segoe UI", system-ui, sans-serif;
  --font-editor:  "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --font-mono:    ui-monospace, "Cascadia Mono", Consolas, monospace;

  /* Shape */
  --radius-sm: 2px;
  --radius-md: 3px;
  --shadow-pop: 0 8px 24px rgba(0, 0, 0, .45);
}
```

## 11. Note on "between"

Vesper is deliberately a *static* dusk theme — the same pixels in every room. If you later want auto-adaptation, the token ladder can be lifted two steps for a daylight variant; but v0 ships one theme, and that constraint is what keeps it looking intentional instead of generic.

## Implementation — Workbench v0 (implemented 2026-09-13)

The theme is implemented in the real app under `workbench/web`:

- **`src/styles.css`** — full Vesper token system (`:root` tokens per the spec),
  all component styles. Signature details in place: sand hairline under the
  project bar, 2px sand left rule on the active tree row, pearl PDF page as the
  brightest surface, small-caps pane headers, brick primary button, no green.
- **`src/vesperTheme.ts`** — CodeMirror `HighlightStyle`: commands sand
  `#B38F6F`, structural commands (sections, environments, document header)
  gold-bright `#C3A893` semibold, citation author keys brick `var(--brick)`,
  comments brown `#8D7564` italic, delimiters taupe `#BCB1A0`.
- **`src/latexMode.ts`** — emits the `keyword.special` token for structural
  commands so the gold-bright rule applies, and tracks citation arguments
  across lines to emit a custom `citation` token (via `tokenTable`) for the
  author keys inside `\citep{…}` & kin.
- **`src/components/PdfViewer.tsx`** — passes `background: "#F2F1ED"` to
  pdf.js render so the page itself is pearl (pdf.js fills white by default).
- **`index.html`** — title "Scientific Harness"; loads Cormorant Garamond +
  Inter from Google Fonts with Palatino/Georgia fallbacks (editor uses system
  Palatino, no webfont needed). Bundling the fonts locally is a v1 item.

Verified: `npm run build` clean; UI served by the sidecar at
`http://127.0.0.1:8765/` with a project open and PDF rendered — see
`app_theme_screenshot.png` (repo root).
