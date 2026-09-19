// LaTeX structure pass (issue 30): walks sectioning commands and text
// paragraphs with line numbers so the editor can overlay position tags
// (S2SS3P4L128) before each paragraph. Pure function over the source text —
// the result feeds decorations only and never enters the document.
//
// Counter semantics:
//   S  — \section number, 1-based; 0 for content before the first section
//   SS — \subsection number, resets on every \section (0 when none yet)
//   P  — text-paragraph number within the current subsection; resets on
//        \subsection, \subsubsection, and \paragraph headings
//   L  — absolute line number of the paragraph's first line
//
// A "text paragraph" is a maximal run of non-blank lines (LaTeX treats blank
// lines as paragraph breaks). Comment-only lines count as blank. Heading runs
// (a run whose first line is a sectioning command) advance the counters but
// carry no tag — the heading itself already says where you are.

/** Sectioning commands that advance the structure counters.
 *  Matches `\section`, `\subsection`, `\subsubsection`, `\paragraph` with an
 *  optional `*` and/or `[short title]` argument; a following letter would make
 *  it a different command (`\paragraphmark{…}` is not a heading). */
const SECTION_RE = /^\\(section|subsection|subsubsection|paragraph)(\*|\[[^\]]*\])*(?![a-zA-Z])/;

/** A line that contributes no text: empty, whitespace-only, or comment-only. */
function isBlank(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("%");
}

export interface ParagraphTag {
  /** 1-based line number of the paragraph's first line. */
  line: number;
  /** Tag text, e.g. `S2SS3P4L128`. */
  tag: string;
}

/**
 * Map each tagged paragraph to its position tag. Keys are 1-based line
 * numbers of the paragraph's first line, in document order (ascending), so a
 * consumer can build sorted decoration ranges directly from iteration order.
 */
export function computeParagraphTags(doc: string): Map<number, string> {
  const out = new Map<number, string>();
  const lines = doc.split("\n");
  let s = 0;
  let ss = 0;
  let p = 0;
  let i = 0;
  while (i < lines.length) {
    // Skip blank/comment-only lines.
    while (i < lines.length && isBlank(lines[i])) i++;
    if (i >= lines.length) break;
    const startLine = i + 1; // 1-based
    const first = lines[i].trim();
    const m = SECTION_RE.exec(first);
    if (m) {
      // Heading run: advance counters, consume the whole run, tag nothing.
      switch (m[1]) {
        case "section":
          s++;
          ss = 0;
          p = 0;
          break;
        case "subsection":
          ss++;
          p = 0;
          break;
        default: // subsubsection / paragraph — new paragraph sequence
          p = 0;
          break;
      }
    } else {
      // Text paragraph: number it within the current subsection.
      p++;
      out.set(startLine, `S${s}SS${ss}P${p}L${startLine}`);
    }
    while (i < lines.length && !isBlank(lines[i])) i++;
  }
  return out;
}
