import { StreamLanguage } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Minimal LaTeX syntax highlighting for v0: comments, control sequences,
 * math/brace delimiters. Not a full parser — just enough to make the editor
 * readable. (No LaTeX mode ships in @codemirror/legacy-modes.)
 *
 * Structural commands (sections, environment begins, document header) get
 * the "keyword.special" token so the Vesper theme can render them
 * gold-bright; ordinary commands render as sand.
 *
 * Citation keys — the author names inside \citep{…} & kin — get a custom
 * "citation" token (mapped via tokenTable) that Vesper renders brick red,
 * so references stand out of the manuscript.
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

/** Visible citation commands whose {…} argument holds author keys.
 *  Starred variants (\citep*) are handled in the tokenizer below. */
const CITE_COMMANDS = new Set([
  "cite", "citet", "citep", "citealp", "citealt", "fullcite",
]);

/** Citation-argument phase, carried across token calls (streams are
 *  per-line, so an argument may span lines; the state rides on the
 *  parser state). */
type CitePhase = "pending" | "opt" | "keys";

export const latexLanguage = StreamLanguage.define<{ cite?: CitePhase }>({
  name: "latex",
  startState: () => ({}),
  tokenTable: { citation: t.special(t.atom) },
  token(stream, state) {
    if (state.cite === "pending") {
      // Just matched a cite command: wait for its argument.
      if (stream.eat("*")) return null; // starred variant — \citep*{…}
      if (stream.match(/[\t ]+/)) return null; // \citep {…} — spaces allowed
      if (stream.eat("[")) { state.cite = "opt"; return "bracket"; }
      if (stream.eat("{")) { state.cite = "keys"; return "bracket"; }
      state.cite = undefined; // no argument — tokenize the char normally below
    } else if (state.cite === "opt") {
      // Optional [prenote] argument: default color until the closing ].
      if (stream.eat("]")) { state.cite = "pending"; return "bracket"; }
      if (!stream.skipTo("]")) stream.skipToEnd();
      return null;
    } else if (state.cite === "keys") {
      // Required {…} argument: the author keys are the brick-red highlight.
      if (stream.eat("}")) { state.cite = undefined; return "bracket"; }
      if (stream.match(/[^\s}\[\]]+/)) return "citation";
      stream.next(); // whitespace between keys stays default
      return null;
    }
    if (stream.eat("%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/\\[a-zA-Z]+/)) {
      const name = stream.current().slice(1);
      if (CITE_COMMANDS.has(name)) state.cite = "pending";
      return STRUCTURAL.has(name) ? "keyword.special" : "keyword";
    }
    if (stream.match(/\\./)) return "bracket";
    if (stream.match(/[{}$]/)) return "bracket";
    if (stream.eatWhile(/[\w\s.,;:!?'"()\-+=*/#&|^_~]/)) return null;
    stream.next(); // fallback: consume any character the class above misses
    return null;
  },
});
