// LaTeX structure pass (issues 30, 38): walks sectioning commands and text
// paragraphs with line numbers so the editor can overlay position tags
// (S2SS3P4L128) before each paragraph, and the Structure module can list the
// document outline. Pure functions over the source text — the results feed
// decorations and the outline tree only, never the document.
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

/** Outline level per command: 1 = \section … 4 = \paragraph. */
const LEVELS: Record<string, number> = { section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };

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

/** One heading in the document outline (Structure module, issue 38). */
export interface StructureHeading {
  /** 1-based line number of the heading command. */
  line: number;
  /** 1 = \section, 2 = \subsection, 3 = \subsubsection, 4 = \paragraph. */
  level: 1 | 2 | 3 | 4;
  /** Position tag of the content this heading opens: `S{s}` for sections and
   *  `S{s}SS{ss}` below them — the counters as left by the heading (P has just
   *  reset to 0, so no P part). */
  tag: string;
  /** Full title text (whitespace collapsed); empty when none is extractable. */
  title: string;
}

/** One run of document lines classified by the structure walk. */
interface WalkRun {
  /** 1-based line number of the run's first line. */
  startLine: number;
  /** Heading level for a heading run, null for a text paragraph. */
  level: number | null;
}

/** Single walk shared by the tag overlay (issue 30) and the outline (issue
 *  38): maximal non-blank runs, classified as heading or text paragraph. */
function walkRuns(doc: string): WalkRun[] {
  const runs: WalkRun[] = [];
  const lines = doc.split("\n");
  let i = 0;
  while (i < lines.length) {
    // Skip blank/comment-only lines.
    while (i < lines.length && isBlank(lines[i])) i++;
    if (i >= lines.length) break;
    const startLine = i + 1; // 1-based
    const first = lines[i].trim();
    const m = SECTION_RE.exec(first);
    runs.push({ startLine, level: m ? LEVELS[m[1]] : null });
    while (i < lines.length && !isBlank(lines[i])) i++;
  }
  return runs;
}

/**
 * Map each tagged paragraph to its position tag. Keys are 1-based line
 * numbers of the paragraph's first line, in document order (ascending), so a
 * consumer can build sorted decoration ranges directly from iteration order.
 */
export function computeParagraphTags(doc: string): Map<number, string> {
  const out = new Map<number, string>();
  let s = 0;
  let ss = 0;
  let p = 0;
  for (const run of walkRuns(doc)) {
    if (run.level === null) {
      // Text paragraph: number it within the current subsection.
      p++;
      out.set(run.startLine, `S${s}SS${ss}P${p}L${run.startLine}`);
    } else if (run.level === 1) {
      s++;
      ss = 0;
      p = 0;
    } else if (run.level === 2) {
      ss++;
      p = 0;
    } else {
      // subsubsection / paragraph — new paragraph sequence
      p = 0;
    }
  }
  return out;
}

/** Character offset of each line's start in the document. */
function lineStarts(doc: string): number[] {
  const starts = [0];
  let i = doc.indexOf("\n");
  while (i >= 0) {
    starts.push(i + 1);
    i = doc.indexOf("\n", i + 1);
  }
  return starts;
}

/** Extract the full title of a heading command: skip `*` and `[short]` args,
 *  then read the balanced `{…}` group (backslash escapes respected). Returns
 *  "" when no brace group follows or it is unbalanced. */
function extractTitle(doc: string, starts: number[], lineNo: number): string {
  const i = lineNo - 1;
  if (i < 0 || i >= starts.length) return "";
  let pos = starts[i];
  while (pos < doc.length && /\s/.test(doc[pos])) pos++; // leading whitespace
  if (doc[pos] !== "\\") return "";
  pos++; // backslash
  while (pos < doc.length && /[a-zA-Z]/.test(doc[pos])) pos++; // command name
  for (;;) {
    while (pos < doc.length && /\s/.test(doc[pos])) pos++;
    if (doc[pos] === "*") {
      pos++;
      continue;
    }
    if (doc[pos] === "[") {
      const close = doc.indexOf("]", pos); // short titles nest no brackets
      if (close < 0) return "";
      pos = close + 1;
      continue;
    }
    break;
  }
  while (pos < doc.length && /\s/.test(doc[pos])) pos++;
  if (doc[pos] !== "{") return ""; // no full-title argument
  let depth = 0;
  const bodyStart = pos + 1;
  for (let j = pos; j < doc.length; j++) {
    const c = doc[j];
    if (c === "\\") {
      j++; // skip the escaped character (\{, \}, \\)
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return doc.slice(bodyStart, j).replace(/\s+/g, " ").trim();
      }
    }
  }
  return ""; // unbalanced — leave the row untitled rather than half-read
}

/**
 * Document outline for the Structure module (issue 38): every sectioning
 * command with its line, level and the tag of the content it opens. Shares its
 * walk with computeParagraphTags so counters stay in lockstep.
 */
export function computeStructure(doc: string): StructureHeading[] {
  const out: StructureHeading[] = [];
  const starts = lineStarts(doc);
  let s = 0;
  let ss = 0;
  for (const run of walkRuns(doc)) {
    if (run.level === null) continue; // text paragraphs are not outline rows
    if (run.level === 1) {
      s++;
      ss = 0;
    } else if (run.level === 2) {
      ss++;
    }
    const tag = run.level === 1 ? `S${s}` : `S${s}SS${ss}`;
    out.push({
      line: run.startLine,
      level: run.level as 1 | 2 | 3 | 4,
      tag,
      title: extractTitle(doc, starts, run.startLine),
    });
  }
  return out;
}
