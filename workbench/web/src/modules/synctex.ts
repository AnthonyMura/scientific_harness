// SyncTeX parser + lookups for the TeX Live 2026 compact format that pdftex
// writes with -synctex=1 (empirically decoded; no public spec exists yet).
//
// File layout:
//   Input:N:<abs path>    — input index N → source file (records carry N)
//   Output/Magnification/Unit/X Offset/Y Offset — header, ignored
//   Content:              — start of the record stream
//   {N … }N               — one group per PDF page, in page order
//   (<x>,<y>…) / [ … ]    — nested region markers; "(" opens a visual line
//   <t>K,L:X,Y[:rest]     — record: type t, input index K, source line L,
//                           coordinates X/Y in scaled DVI points
//
// Coordinates: X is from the left page edge, Y from the top of the page, both
// in units of 1/(65536·72.27/72) PDF pt — TeX's internal "scaled point" (its
// point is 1/72.27 inch, not the PDF 1/72). The recorded Y sits a few pt
// above the text baseline; lookups absorb that residual by snapping to the
// nearest rendered line instead of demanding an exact hit.
//
// Sentinel records: when TeX flushes a paragraph buffer it emits one or two
// extra records at the visual line's start/end carrying the *current input
// line* (the line being read at flush time, e.g. \end{document} or the next
// sectioning command) — not text that is actually on that line. They appear
// as leading/trailing runs matching the enclosing "(" group's own
// (kind,line); parseSynctex drops them so they cannot win nearest-neighbor
// lookups.

export const SYNCTEX_SCALE = 65536 * (72.27 / 72); // units per PDF pt

export interface SynctexRecord {
  kind: number; // Input index → source file
  line: number; // 1-based line in that file
  xPt: number; // from the left page edge
  yPt: number; // from the top of the page (≈ baseline, a few pt above)
  groupX: number; // left edge of the enclosing visual-line region
}

export interface SynctexPage {
  records: SynctexRecord[];
}

export interface SynctexFile {
  abs: string;
  /** Project-relative path (null for TeX system files / outside the project). */
  rel: string | null;
}

export interface SynctexData {
  files: Map<number, SynctexFile>;
  pages: SynctexPage[];
}

const RECORD_RE = /^([a-zA-Z\[\]()!])(\d+),(\d+):(-?\d+),(-?\d+)(?::(.*))?$/;
const HEADER_RE =
  /^(SyncTeX Version|Output|Magnification|Unit|X Offset|Y Offset|Content|Postamble|Count|Post scriptum):/;

interface GroupCtx {
  kind: number;
  line: number;
  x: number; // left edge of the visual-line region
  buffer: SynctexRecord[];
}

function normalizePath(p: string): string {
  return p.split("/").filter((s) => s && s !== ".").join("/");
}

/** Drop leading/trailing sentinel runs (see file header for why they exist). */
function filterSentinels(g: GroupCtx): SynctexRecord[] {
  const b = g.buffer;
  if (b.length === 0) return b;
  let hasOther = false;
  for (const r of b) {
    if (r.kind !== g.kind || r.line !== g.line) {
      hasOther = true;
      break;
    }
  }
  if (!hasOther) return b; // whole line belongs to the group's own line
  let start = 0;
  let end = b.length;
  while (start < end && b[start].kind === g.kind && b[start].line === g.line) start++;
  while (end > start && b[end - 1].kind === g.kind && b[end - 1].line === g.line) end--;
  return b.slice(start, end);
}

/** Parse a gunzipped .synctex.gz body into per-page records + file map. */
export function parseSynctex(text: string, projectRoot: string | null): SynctexData {
  const files = new Map<number, SynctexFile>();
  const pages: SynctexPage[] = [];
  const root = projectRoot ? normalizePath(projectRoot) : null;
  let page: SynctexPage | null = null;
  const stack: GroupCtx[] = [];

  const flushGroup = () => {
    const g = stack.pop();
    if (!g) return;
    const kept = filterSentinels(g);
    if (stack.length) stack[stack.length - 1].buffer.push(...kept);
    else page?.records.push(...kept);
  };

  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const inp = /^Input:(\d+):(.+)$/.exec(l);
    if (inp) {
      const abs = normalizePath(inp[2]);
      let rel: string | null = null;
      if (root && abs.startsWith(root + "/")) rel = abs.slice(root.length + 1);
      files.set(Number(inp[1]), { abs, rel });
      continue;
    }
    if (HEADER_RE.test(l) || l.startsWith("!")) continue;
    if (/^\{\d+$/.test(l)) {
      page = { records: [] };
      pages.push(page);
      continue;
    }
    if (/^\}\d+$/.test(l)) {
      page = null;
      continue;
    }
    if (l === ")") {
      flushGroup();
      continue;
    }
    const m = RECORD_RE.exec(l);
    if (!m || !page) continue;
    const type = m[1];
    const kind = Number(m[2]);
    const lineNo = Number(m[3]);
    const xPt = Number(m[4]) / SYNCTEX_SCALE;
    const yPt = Number(m[5]) / SYNCTEX_SCALE;
    if (type === "(") {
      stack.push({ kind, line: lineNo, x: xPt, buffer: [] });
      continue;
    }
    if (type === ")") {
      flushGroup();
      continue;
    }
    if (!"xkghr".includes(type)) continue; // structural [ ] and unknowns
    const rec: SynctexRecord = {
      kind,
      line: lineNo,
      xPt,
      yPt,
      groupX: stack.length ? stack[stack.length - 1].x : xPt,
    };
    if (stack.length) stack[stack.length - 1].buffer.push(rec);
    else page.records.push(rec);
  }
  while (stack.length) flushGroup(); // unclosed groups at end of stream
  return { files, pages };
}

function kindForFile(data: SynctexData, file: string): number | null {
  const want = normalizePath(file);
  for (const [kind, f] of data.files) {
    if (f.rel === file || f.abs === want) return kind;
  }
  return null;
}

/** Forward search: first rendered position of a source line (topmost). */
export function forwardLookup(
  data: SynctexData,
  file: string,
  line: number,
): { page: number; xPt: number; yPt: number } | null {
  const kind = kindForFile(data, file);
  if (kind == null) return null;
  for (let i = 0; i < data.pages.length; i++) {
    for (const r of data.pages[i].records) {
      if (r.kind === kind && r.line === line) {
        return { page: i + 1, xPt: r.groupX, yPt: r.yPt };
      }
    }
  }
  return null;
}

/** Inverse search: nearest source line to a point on a page. */
export function reverseLookup(
  data: SynctexData,
  page: number,
  xPt: number,
  yPt: number,
): { file: string; line: number } | null {
  const p = data.pages[page - 1];
  if (!p || p.records.length === 0) return null;
  // 1) Nearest visual line by vertical distance (line spacing is ≥ ~14 pt).
  let anchor: SynctexRecord | null = null;
  let bestDy = Infinity;
  for (const r of p.records) {
    const dy = Math.abs(r.yPt - yPt);
    if (dy < bestDy) {
      bestDy = dy;
      anchor = r;
    }
  }
  if (!anchor || bestDy > 8) return null; // not near any text line
  // 2) Within that visual line, nearest record by x — a wrapped paragraph line
  //    can hold several source lines side by side.
  let hit: SynctexRecord | null = null;
  let bestDx = Infinity;
  for (const r of p.records) {
    if (Math.abs(r.yPt - anchor.yPt) > 0.5) continue;
    const dx = Math.abs(r.xPt - xPt);
    if (dx < bestDx) {
      bestDx = dx;
      hit = r;
    }
  }
  if (!hit || bestDx > 60) return null;
  const f = data.files.get(hit.kind);
  if (!f || !f.rel) return null; // TeX system file — nothing to open
  return { file: f.rel, line: hit.line };
}
