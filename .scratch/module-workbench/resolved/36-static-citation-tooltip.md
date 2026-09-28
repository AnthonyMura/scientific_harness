# 36 — Static citation tooltip (no cursor tracking)

Status: resolved (implemented and verified on the real project)

## Request

User feedback on issue 35: it works but feels tricky. Wanted a **static**
overlay: hover the citation → the card appears bottom-right of the cursor and
then stays put; moving the cursor onto the card keeps it alive until the mouse
leaves it — so text can be selected/copied and DOI links clicked without the
card running away.

## Design

- `PdfViewer.tsx`: removed the `mousemove` repositioning entirely. The card is
  positioned **once at show time** (cursor + (12,16), flipped above near the
  viewport bottom, clamped horizontally) and never moves again for that hover
  session; swapping between adjacent citations keeps both content-swap-in-place
  and the original position. `lastX/lastY` are still recorded on mouseover for
  that single placement.
- The issue-35 grace bridge (200 ms pending hide, cancelled by entering the
  other element) is unchanged — with a static card it now feels natural instead
  of tricky: the target no longer moves while you cross the gap.
- No CSS change needed (already `pointer-events: auto`, `user-select: text`).

## Verification (real project, CDP + real mouse events)

1. `[3,4,5]` card shown at a fixed rect (bottom-right of the cursor).
2. Cursor moved around on the marker — card rect **unchanged** (previously it
   tracked the cursor).
3. Pointer on the card after 700 ms: still visible, same position.
4. Drag-selection inside the card works ("nfertility in 204 countries and
   territories between").
5. Leaving marker and card: hidden after the grace period.

`tsc --noEmit` + production build green.

## Comments

(refinement of issue 35, requested by the user before it settled)
