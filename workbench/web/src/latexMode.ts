import { StreamLanguage } from "@codemirror/language";

/**
 * Minimal LaTeX syntax highlighting for v0: comments, control sequences,
 * math/brace delimiters. Not a full parser — just enough to make the editor
 * readable. (No LaTeX mode ships in @codemirror/legacy-modes.)
 *
 * Structural commands (sections, environment begins, document header) get
 * the "keyword.special" token so the Vesper theme can render them
 * gold-bright; ordinary commands render as sand.
 */

const STRUCTURAL = new Set([
  "documentclass",
  "usepackage",
  "title",
  "author",
  "date",
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "begin",
  "end",
  "includegraphics",
  "bibliography",
]);

export const latexLanguage = StreamLanguage.define({
  name: "latex",
  token(stream) {
    if (stream.eat("%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/\\[a-zA-Z]+/)) {
      return STRUCTURAL.has(stream.current().slice(1)) ? "keyword.special" : "keyword";
    }
    if (stream.match(/\\./)) return "bracket";
    if (stream.match(/[{}$]/)) return "bracket";
    if (stream.eatWhile(/[\w\s.,;:!?'"()\-+=*/#&|^_~]/)) return null;
    stream.next(); // fallback: consume any character the class above misses
    return null;
  },
});
