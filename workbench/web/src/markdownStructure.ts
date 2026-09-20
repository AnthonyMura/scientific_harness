// Markdown outline pass (issue 38): ATX headings (# … ######) with line
// numbers for the Structure module. Fenced code blocks are skipped so a
// "# not a heading" inside ``` never lands in the tree. Pure function over
// the source text; results feed the outline only, never the document.

export interface MarkdownHeading {
  /** 1-based line number of the heading. */
  line: number;
  /** ATX level, 1–6. */
  level: number;
  /** Heading text (closing hashes and surrounding whitespace stripped). */
  title: string;
}

/** Opening/closing fence: ``` or ~~~ with up to three leading spaces. */
const FENCE_RE = /^ {0,3}(```|~~~)/;
/** ATX heading: 1–6 hashes, a space, then the title (CommonMark). */
const ATX_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function computeMarkdownHeadings(doc: string): MarkdownHeading[] {
  const out: MarkdownHeading[] = [];
  let inFence: string | null = null; // the fence marker ('```' or '~~~') when inside
  const lines = doc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (inFence === null) inFence = fence[1];
      else if (fence[1] === inFence) inFence = null; // closing fence (same char)
      continue;
    }
    if (inFence !== null) continue;
    const m = ATX_RE.exec(line);
    if (!m) continue;
    out.push({ line: i + 1, level: m[1].length, title: m[2].trim() });
  }
  return out;
}
