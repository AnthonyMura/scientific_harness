// PDF citation index (issue 26): scans each rendered page's pdf.js text layer
// for numbered citation groups ([1], [2,3], [4–6]), drops a transparent
// clickable marker over each group, and indexes the bibliography entries of
// the References section so a click on a citation can jump to its reference
// entry. Pure geometry + DOM scanning — no React.
//
// All boxes are page-local CSS px at the current zoom: the text layer's spans
// are laid out in exactly those units, and every re-render (zoom / mode
// switch / new compile) re-runs the scan, so the index is never stale relative
// to what is on screen. Numbered styles only — author-year ("Smith (2023)")
// is out of scope for v0.

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One detected [...] group. `numbers` is range-expanded ([4-6] → 4,5,6) and
 *  `subBoxes[i]` covers the i-th number so a click inside [2,3] can target
 *  the digit under the cursor (a range's members share its character span,
 *  split proportionally). */
export interface CiteGroup {
  numbers: number[];
  box: Box; // union of all matched characters
  subBoxes: Box[]; // one per expanded number
}

/** One visual line of a page, in page-local CSS px (yTop = top edge). */
export interface LineItem {
  text: string;
  x0: number;
  yTop: number;
  x1: number;
}

/** A bibliography entry starting on the given (1-based) page. The first-line
 *  extent (xPx/yTopPx/x1Px/lineHpx) sizes the jump flash. */
export interface BibEntry {
  page: number;
  xPx: number;
  yTopPx: number;
  x1Px: number;
  lineHpx: number;
  lines: string[]; // all entry text, one item per visual line
}

/** A span as read from pdf.js's TextLayer.textDivs — structural, so the Node
 *  harness can pass fakes with the same shape. */
export interface TextSpan {
  textContent: string;
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number };
}

/** A span read into page-local coordinates. */
interface SpanItem {
  text: string;
  box: Box;
}

/** One character with its (proportionally split) box — the provenance that
 *  maps regex matches back onto glyph positions. */
interface CharBox {
  ch: string;
  box: Box;
}

/** A grouped visual line plus per-character provenance. */
interface LineGroup {
  text: string;
  x0: number;
  yTop: number;
  x1: number;
  chars: CharBox[];
}

export interface PageScan {
  groups: CiteGroup[];
  lines: LineItem[];
}

// En/em dashes → hyphen before matching (TeX renders ranges with --).
const DASH_RE = /[–—]/g;
// A candidate bracket group — no nested brackets, any content.
const GROUP_RE = /\[[^\[\]]*\]/g;
// One comma-separated part: a number or a range of numbers (spaces allowed).
const PART_RE = /^\d{1,4}(\s*-\s*\d{1,4})?$/;
// A bibliography entry start: "[N]" at the beginning of a line.
const ENTRY_RE = /^\s*\[(\d{1,4})\]/;
// A bare-number entry label ("72. Author…", MDPI/ACS print style): number +
// dot at the line start with a space after the dot (rejects decimals and DOIs
// wrapped to a line start). Ambiguous with prose, so scanBibliography accepts
// one only when it continues the accepted number sequence.
const BARE_ENTRY_RE = /^\s*(\d{1,4})\.\s/;
// The References / Bibliography heading (standalone line).
const HEADING_RE = /^\s*(references|bibliography)\b/i;
// A range expands to at most this many members (guards [1-9999]).
const MAX_RANGE_MEMBERS = 50;
// Heading-less fallback (see findBibStart): a real reference's first line is an
// author/title line, while the other bare "N." lines in such documents are
// short section titles ("2. Materials and Methods") or prose — require at
// least this much text on the candidate's first line.
const MIN_FALLBACK_ENTRY_CHARS = 30;
// …and the validated number sequence must reach this many entries: a prose
// numbered list rarely runs that long, a real bibliography almost always does.
const MIN_FALLBACK_ENTRIES = 8;

function unionBox(boxes: Box[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, y0, x1, y1 };
}

/** Group spans into visual lines: sort by vertical center and start a new
 *  line when the offset from the line's anchor exceeds `tol` px — a subscript
 *  stays on its line, two different baselines never merge (so a citation
 *  wrapped across two lines is not matched). Within a line, characters get
 *  proportional boxes so matches can be mapped back onto glyphs. */
export function groupLines(
  items: { text: string; box: Box }[],
  tol: number,
): LineGroup[] {
  const sorted = [...items].sort(
    (a, b) =>
      (a.box.y0 + a.box.y1) / 2 - (b.box.y0 + b.box.y1) / 2 ||
      a.box.x0 - b.box.x0,
  );
  const lines: LineGroup[] = [];
  let cur: LineGroup | null = null;
  let anchorY = 0;
  for (const it of sorted) {
    const yc = (it.box.y0 + it.box.y1) / 2;
    if (!cur || Math.abs(yc - anchorY) > tol) {
      cur = { text: "", x0: Infinity, yTop: Infinity, x1: -Infinity, chars: [] };
      lines.push(cur);
      anchorY = yc;
    }
    const n = it.text.length;
    if (n > 0) {
      const cw = (it.box.x1 - it.box.x0) / n;
      for (let j = 0; j < n; j++) {
        cur.chars.push({
          ch: it.text[j],
          box: {
            x0: it.box.x0 + j * cw,
            y0: it.box.y0,
            x1: it.box.x0 + (j + 1) * cw,
            y1: it.box.y1,
          },
        });
      }
    }
    cur.text += it.text;
    if (it.box.x0 < cur.x0) cur.x0 = it.box.x0;
    if (it.box.y0 < cur.yTop) cur.yTop = it.box.y0;
    if (it.box.x1 > cur.x1) cur.x1 = it.box.x1;
  }
  return lines;
}

/** Find the numbered citation groups in one visual line. Bracketed content
 *  that is not a clean comma list of numbers/ranges ([1a], [1 2]) is rejected;
 *  ranges expand to their members, capped at MAX_RANGE_MEMBERS. A group whose
 *  characters span a large horizontal gap (a two-column boundary) is rejected
 *  too — a real bracket group is compact. */
export function matchCitations(line: LineGroup): CiteGroup[] {
  const norm = line.text.replace(DASH_RE, "-");
  const out: CiteGroup[] = [];
  let m: RegExpExecArray | null;
  GROUP_RE.lastIndex = 0;
  while ((m = GROUP_RE.exec(norm))) {
    const inner = m[0].slice(1, -1);
    if (inner.trim() === "") continue;
    const numbers: number[] = [];
    const subBoxes: Box[] = [];
    let ok = true;
    let off = 0; // offset of the current part within `inner`
    for (const part of inner.split(",")) {
      if (!PART_RE.test(part.trim())) {
        ok = false;
        break;
      }
      const absStart = m.index + 1 + off;
      let d0 = -1;
      let d1 = -1;
      for (let i = 0; i < part.length; i++) {
        if (/\d/.test(part[i])) {
          if (d0 === -1) d0 = i;
          d1 = i;
        }
      }
      const segBox = unionBox(
        line.chars.slice(absStart + d0, absStart + d1 + 1).map((c) => c.box),
      );
      const trimmed = part.trim();
      const a = parseInt(trimmed.split("-")[0], 10);
      const b = trimmed.includes("-") ? parseInt(trimmed.split("-").pop() ?? "", 10) : a;
      const count = b > a ? Math.min(b - a + 1, MAX_RANGE_MEMBERS) : 1;
      const w = count > 1 ? (segBox.x1 - segBox.x0) / count : 0;
      for (let k = 0; k < count; k++) {
        numbers.push(a + k);
        subBoxes.push(
          count === 1
            ? segBox
            : { x0: segBox.x0 + k * w, y0: segBox.y0, x1: segBox.x0 + (k + 1) * w, y1: segBox.y1 },
        );
      }
      off += part.length + 1; // the comma after each part but the last
    }
    if (!ok || numbers.length === 0) continue;
    const groupChars = line.chars.slice(m.index, m.index + m[0].length);
    let maxGap = 0;
    for (let i = 1; i < groupChars.length; i++) {
      const gap = groupChars[i].box.x0 - groupChars[i - 1].box.x1;
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap > 60) continue; // spans a column boundary — not one citation
    out.push({ numbers, box: unionBox(groupChars.map((c) => c.box)), subBoxes });
  }
  return out;
}

/** Create the transparent clickable marker for a group. The caller appends it
 *  to the page wrapper after the text layer so it sits above and intercepts
 *  pointer events on the cited glyphs (text selection starting exactly on a
 *  citation is sacrificed — by design, the citations are interactive). */
/** Slack (px) around a citation group's box. Exported because the viewer's
 *  bibliography-unmark pass compares marker offsets against line geometry. */
export const CITE_MARKER_PAD = 2;

export function makeCiteMarker(g: CiteGroup): HTMLElement {
  const el = document.createElement("span");
  el.className = "pdf-cite";
  el.dataset.cite = g.numbers.join(",");
  const pad = CITE_MARKER_PAD; // slack so the link tint/underline clears the glyph edges
  el.style.left = `${g.box.x0 - pad}px`;
  el.style.top = `${g.box.y0 - pad}px`;
  el.style.width = `${g.box.x1 - g.box.x0 + pad * 2}px`;
  el.style.height = `${g.box.y1 - g.box.y0 + pad * 2}px`;
  return el;
}

/** Scan one rendered page: read the text layer's spans into page-local boxes,
 *  group them into visual lines, detect citation groups (appending a marker
 *  for each), and return the data the viewer keeps in refs. */
export function scanPage(
  pageDiv: {
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number };
    appendChild(el: HTMLElement): void;
    style?: { getPropertyValue?: (k: string) => string };
  },
  layer: { textDivs: TextSpan[] },
  makeMarker: (g: CiteGroup) => HTMLElement = makeCiteMarker,
): PageScan {
  const prect = pageDiv.getBoundingClientRect();
  const items: SpanItem[] = [];
  for (const span of layer.textDivs) {
    const text = span.textContent ?? "";
    if (!text) continue;
    const r = span.getBoundingClientRect();
    if (r.right <= r.left && r.bottom <= r.top) continue; // collapsed item
    items.push({
      text,
      box: {
        x0: r.left - prect.left,
        y0: r.top - prect.top,
        x1: r.right - prect.left,
        y1: r.bottom - prect.top,
      },
    });
  }
  // Line tolerance in CSS px at the current zoom (read from the page wrapper;
  // ~7px per unit of scale keeps subscripts on their line at every zoom).
  const scale = parseFloat(pageDiv.style?.getPropertyValue?.("--scale-factor") ?? "") || 1;
  const lines = groupLines(items, 2 + 7 * scale);
  const groups: CiteGroup[] = [];
  for (const line of lines) {
    for (const g of matchCitations(line)) {
      groups.push(g);
      pageDiv.appendChild(makeMarker(g));
    }
  }
  return { groups, lines: lines.map(({ text, x0, yTop, x1 }) => ({ text, x0, yTop, x1 })) };
}

/** Where the bibliography's entry text starts: the (page, line) of the first
 *  line to read as entry content. Heading case: the line AFTER the "References"
 *  / "Bibliography" heading. Fallback case (no heading anywhere): a validated
 *  bare "1." label — MDPI submission builds render the references section with
 *  an empty \section (mdpi.cls leaves \@reftitle unset), so there is no
 *  heading text to find, only the numbered entries themselves. */
function findBibStart(pages: LineItem[][]): { page: number; line: number } | null {
  for (let pi = 0; pi < pages.length; pi++) {
    const li = pages[pi].findIndex((l) => HEADING_RE.test(l.text));
    if (li >= 0) return { page: pi, line: li + 1 };
  }
  // Heading-less fallback. A candidate is a bare "1." label in the left half
  // whose first line is long enough to be a reference (not a section title);
  // it is accepted only if the number sequence continues to
  // MIN_FALLBACK_ENTRIES entries. Among passing candidates the LAST one wins:
  // prose numbered lists sit mid-document, a bibliography sits at the end.
  const pageWidth = (lines: LineItem[]): number => {
    let w = 0;
    for (const l of lines) if (l.x1 > w) w = l.x1;
    return w;
  };
  let best: { page: number; line: number } | null = null;
  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi];
    const width = pageWidth(lines);
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const m = BARE_ENTRY_RE.exec(line.text);
      if (!m || m[1] !== "1") continue;
      if (width > 0 && line.x0 >= width / 2) continue; // two-column guard
      if (line.text.trim().length < MIN_FALLBACK_ENTRY_CHARS) continue;
      let expect = 2;
      let found = 1;
      for (let p2 = pi; p2 < pages.length && found < MIN_FALLBACK_ENTRIES; p2++) {
        const l2s = pages[p2];
        const w2 = pageWidth(l2s);
        for (let l2 = p2 === pi ? li + 1 : 0; l2 < l2s.length; l2++) {
          const t = l2s[l2];
          const mm = BARE_ENTRY_RE.exec(t.text);
          if (mm && mm[1] === String(expect) && (w2 <= 0 || t.x0 < w2 / 2)) {
            found++;
            expect++;
          }
        }
      }
      if (found >= MIN_FALLBACK_ENTRIES) best = { page: pi, line: li };
    }
  }
  return best;
}

/** Index the bibliography entries of a rendered document. The section starts
 *  at the first line beginning with "References" / "Bibliography"; after it,
 *  an entry starts at a line beginning with [N] or a bare "N." label in the
 *  left half of the page (two-column guard) and runs until the next entry
 *  start — entries may span pages. A document uses one label style: the first
 *  detected entry locks it, so a "[2]" wrapped to a line start in an MDPI
 *  ("N.") bibliography — or a bare "2." in a [N] one — is read as
 *  continuation text. Bare labels are ambiguous with prose, so they must also
 *  continue the accepted number sequence (1, 2, 3, …); bracketed labels are
 *  unambiguous and need no such guard. When no heading exists at all, a
 *  validated bare "1." label starts the section instead (findBibStart) — this
 *  covers MDPI submission builds whose references section renders without a
 *  visible heading. No start found → empty map (the feature stays inert). */
export function scanBibliography(pages: LineItem[][]): Map<number, BibEntry> {
  const start = findBibStart(pages);
  if (!start) return new Map<number, BibEntry>();
  const out = new Map<number, BibEntry>();
  let entry: { num: number; page: number; li: number; lines: string[] } | null = null;
  let lastNum = 0; // last accepted entry number (bare-label sequence guard)
  let labelStyle: "bracket" | "bare" | null = null;

  const flush = () => {
    if (!entry) return;
    const pageLines = pages[entry.page - 1] ?? [];
    const l = pageLines[entry.li];
    const next = pageLines[entry.li + 1];
    const gap = next ? next.yTop - l.yTop : 0;
    out.set(entry.num, {
      page: entry.page,
      xPx: l.x0,
      yTopPx: l.yTop,
      x1Px: l.x1,
      lineHpx: gap > 4 && gap < 60 ? gap : 16,
      lines: entry.lines,
    });
    entry = null;
  };

  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi];
    if (!lines.length) continue;
    let width = 0;
    for (const l of lines) if (l.x1 > width) width = l.x1;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (pi < start.page || (pi === start.page && li < start.line)) continue;
      const m = ENTRY_RE.exec(line.text);
      const bm = m ? null : BARE_ENTRY_RE.exec(line.text);
      // Two-column guard: v0 accepts entry starts in the left half only. The
      // first detected label locks the document's style; a bare label must
      // additionally continue the number sequence (prose guard).
      if (
        width > 0 &&
        line.x0 < width / 2 &&
        ((m && labelStyle !== "bare") || (bm && labelStyle !== "bracket")) &&
        (!bm || bm[1] === String(lastNum + 1))
      ) {
        flush();
        entry = { num: parseInt((m ?? bm)![1], 10), page: pi + 1, li, lines: [line.text] };
        lastNum = entry.num;
        labelStyle = m ? "bracket" : "bare";
      } else if (entry) {
        entry.lines.push(line.text);
      }
    }
  }
  flush();
  return out;
}

/** First bibliography line per page: the index of the "References" /
 *  "Bibliography" heading on the page that carries it, 0 for every page after
 *  (the section runs to the end of the document), -1 where there is none. The
 *  viewer uses this to unmark citation groups on bibliography lines — a [N] at
 *  the start of a reference line is an entry label, not a citation. */
export function bibStartLines(pages: LineItem[][]): number[] {
  const out = new Array<number>(pages.length).fill(-1);
  let seenHeading = false;
  for (let pi = 0; pi < pages.length; pi++) {
    if (seenHeading) {
      out[pi] = 0;
      continue;
    }
    const li = pages[pi].findIndex((l) => HEADING_RE.test(l.text));
    if (li >= 0) {
      out[pi] = li;
      seenHeading = true;
    }
  }
  return out;
}
