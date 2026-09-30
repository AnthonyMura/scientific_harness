# 46 — Selection assist panel ("work with part of text") + word translation

Status: needs-triage

**Design ticket.** The full panel concept below is for discussion with the
author; the only part approved for immediate implementation is the first
feature (word translation, RU↔EN). Everything else stays on the roadmap until
the design is agreed.

## Request (user)

"The most complicated feature for editor .tex and .md files." Target problem:
when people work on text they start by writing scratch and then refine it —
but today they have to use an independent file or write on a new line in the
same file, which is really not convenient. The user calls this **"work with
part of text"**.

Semi-problem: "work with part of text" can be expanded. For example, the user
wants to write new text based on a prompt on a new line — they need a button
for it. One more idea is **"rewrite with assistance"**: choose text and click
rewrite; e.g. the user has a specific writing style and wants the text
rewritten according to that skill.

The idea: a small panel with such functions. This ticket develops the design
and adds **one** small feature for this panel: **word translation (Russian ↔
English)** — pop up if a single word is chosen. Not more. Tooltips on all new
controls.

## Problem

- The scratch → refine workflow has no home inside the document: the draft
  goes into an independent file (context lost, manual reassembly) or onto a new
  line in the same file (pollutes the document, must be deleted later).
- Both workarounds break flow: the text being worked on and its context (the
  surrounding paragraphs) are never adjacent.
- The natural fix: a temporary workspace anchored to *part of the text* — not
  a file, not a line in the document.

## Design — selection assist panel

### Concept

A small floating panel ("selection assist") that appears when there is a
non-empty selection in a `.tex` or `.md` editor tab and offers actions that
operate on exactly that part of the text. The panel is a **trigger surface**,
not a workspace: quick actions resolve inline (the translation popup); heavy
actions open a workspace (the split pane below).

### Trigger and placement

- A non-empty selection settles in an editor tab (no change for ~150 ms —
  avoids flicker while dragging) → the panel appears anchored to the end of
  the selection, clamped inside the viewport.
- Dismissed by: Escape, click outside, selection change, tab close/switch.
- Never fights other overlays: hidden while an autocomplete overlay is open
  (#23/#29/#44), and must not break the editor's click-to-SyncTeX handler.

### Actions (roadmap)

| Action | Trigger | Workspace | Status |
|---|---|---|---|
| **Translate word** (RU↔EN) | single-word selection → auto popup near the selection | none (inline popup) | **this ticket — implement** |
| Rewrite with assistance | multi-word/multi-line selection → panel button; LLM rewrites per the user's style skill | split pane right of the selection | roadmap — needs LLM provider config (v0 has none) |
| Draft from prompt | panel button + small prompt input; LLM drafts new text at/after the selection point | split pane | roadmap — needs LLM |
| Scratch pad | selection → panel button opens an empty split pane for hand-written scratch, then "insert at selection" / "replace selection" | split pane | roadmap — no LLM needed, but follows the same workspace design |

### Workspace: split-pane rewrite (per v3)

For scratch/rewrite work the workspace is v3's **split-pane rewrite**: a
split opens *to the right of the selection* (not a second window); text before
and after stays in place; the pane is empty space where you write new text by
hand or with an LLM. The panel buttons are the entry point into that pane.
When block IDs land (the increment after v0), "insert/replace" anchors on
block ID + fingerprint, so a stale proposal can't silently overwrite changed
text; until then it is a plain selection-range dispatch (one undo step).

### Relation to the v3 conception

- **Invisible intelligence**: for ordinary users the LLM appears as buttons,
  not chat — this panel is exactly that surface for the editor.
- **M6 conductor**: each action becomes an allowlisted command
  (`text.translateWord`, `text.rewriteSelection`, `text.draftFromPrompt`); UI
  buttons and the conductor call the same commands. The translation endpoint
  designed here can later swap from a translation-API adapter to an LLM call
  without UI changes.

## First feature — word translation (RU↔EN)

### Behavior

- Applies to `.tex` and `.md` editor tabs only.
- Select exactly one plain word → after the settle delay a small popup appears
  near the end of the selection showing:
  - the translated word (primary text),
  - a direction label (`RU → EN` / `EN → RU`) — direction auto-detected by
    script: Cyrillic source → English translation; Latin source → Russian. No
    manual toggle ("not more").
- Popup actions: **replace** the selected word with the translation (single
  undoable edit; autosave #20 persists it) and close. [Author decision — Q1]
- States: loading, success, error — on network/provider failure the popup shows
  "Translation unavailable" plus a tooltip explaining why; never crashes the
  editor.
- Dismissed by Escape / click outside / selection change / tab switch.

### Eligibility ("single word")

- The selection must be one token of letters/digits/hyphens/apostrophes/
  underscores, no newlines, no backslash or braces → LaTeX commands
  (`\citep`, `\section`), math and verbatim content never trigger the popup.
  Plain text inside `\emph{…}` is eligible (it is just text).
- Surrounding punctuation is stripped for the lookup but not for the
  replacement range.

### Tooltips (explicit requirement)

Every new control gets a native `title` tooltip, matching app convention
(`title="Editor settings"` etc.): replace button ("Replace the selected word
with the translation"), close ("Close"), and the popup card itself
("Translation: … — click to replace"). The error state carries its own
explanatory tooltip.

### Backend

- New endpoint (token-gated like all others): `POST /api/translate/word`
  `{text}` → `{translation, from: "ru"|"en", to: "en"|"ru"}`; 4xx on
  ineligible input, 502 with a stable error code when the provider is
  unreachable.
- Provider behind an adapter interface (`workbench_backend/translate.py`) —
  v0 has no LLM, so the v0 provider is a keyless translation API (candidates:
  MyMemory REST, Google's free web endpoint; decide at claim time). Hard
  timeout ~4 s.
- Cache: in-memory LRU (~5 000 words) so re-selecting the same word never
  refetches.
- Note: this is MT/dictionary lookup, not an LLM call; when M6 lands,
  `text.translateWord` can be upgraded to LLM translation with style context
  behind the same endpoint.

### Frontend implementation notes (for claim time)

- New `web/src/selectionAssist/`: a CM6 plugin registered in `EditorPane` for
  `.tex`/`.md` tabs — selection tracking via `updateListener`
  (`u.selectionSet`) + settle debounce; placement via `view.coordsAt` with
  viewport clamping.
- The popup is an imperative fixed-position DOM node — the same pattern as the
  citation tooltip (PdfViewer.tsx, static placement since #36); styles in the
  Vesper palette in `styles.css` (e.g. `.word-trans-tip`).
- `api.ts`: `translateWord(text)`.

## Open design questions (resolve with the author before implementation)

1. **Click-to-replace or display-only?** Recommended: replace on click (one
   undo step, autosave persists) — that is what makes it "work with part of
   text" instead of a dictionary lookup.
2. **Word edge cases**: are hyphenated words eligible? Transliterated Russian
   in Latin script will be misdetected as EN→RU — accept the misdetection or
   skip such words?
3. **Provider choice** (MyMemory vs Google free endpoint vs other) and offline
   behavior: hide the popup silently, or show the error state?
4. **Sensitivity policy**: v3 gives projects a sensitivity level ("whether a
   remote LLM may be used at all"). Gate external translation behind a project
   toggle now (default on?), or defer to M6?
5. **Popup placement details**: above vs below the selection; which side for a
   word near a viewport edge.
6. **Later faces**: when does the multi-word action bar appear (threshold: N
   words / 2 lines?), keyboard shortcut for translation, and whether the
   scratch workspace is a true split pane (layout system #05/#12) or an
   overlay.

## Verification plan

Fixture `.tex` with Russian + English words (and one `\citep{key}`):

- Select a RU word → popup shows the EN translation; select an EN word → RU.
  Direction label correct both ways.
- Select `\citep`, punctuation, or multi-line text → no popup.
- Click replace → document updated at the right range, one Ctrl-Z restores,
  autosave persists to disk.
- Escape / outside click / selection change dismisses the popup.
- Provider down (network cut) → error state + tooltip; editor stays
  responsive.
- All new controls expose a `title` tooltip.

CDP headless checks per AGENTS.md (real mouse events for the selection;
`Runtime.evaluate` for popup state).

## Related

- v3 conception — split-pane rewrite, "invisible intelligence", M6 conductor,
  project sensitivity policy (`docs/technical_description_v3.md`)
- #40 — journal-theme rewrite (same assist family; LLM-dependent)
- #27/#34–#36 — citation tooltip pattern the popup follows
- #24 — spellcheck (external dictionary fetch + cache precedent)
- #23/#29/#44 — autocomplete overlays the panel must not fight

## Comments

New ticket (2026-09-30); design per user request: "the most complicated
feature for editor .tex and .md files … work with part of text … a small panel
with such functions … word translation (russian to english and back). Pop up if
choose single word. not more. do not forget to add tooltip."
