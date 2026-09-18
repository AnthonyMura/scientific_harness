import { StreamLanguage, type StringStream } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { NON_KEYED_BIB_TYPES, STANDARD_BIB_TYPES } from "./bibFormat";

/**
 * Minimal BibTeX syntax highlighting for v0 (Vesper palette, no new colors):
 * entry types (@article…) are gold-bright structural keywords, the entry key
 * is the citation atom (gold-bright — same tag as \citep{…} keys in .tex),
 * field names are sand keywords, string values stay default prose,
 * braces/commas taupe, % comments brown italic.
 */

type BibPhase = "top" | "afterType" | "key" | "fields";
interface BibState { phase: BibPhase; type?: string; depth: number }

export const bibLanguage = StreamLanguage.define<BibState>({
  name: "bibtex",
  tokenTable: { citation: t.special(t.atom) },
  startState: () => ({ phase: "top", depth: 0 }),
  token(stream, state) {
    if (stream.eat("%")) {
      stream.skipToEnd();
      return "comment";
    }

    if (state.phase === "afterType") {
      // Just matched @type — expect the entry's opening brace.
      if (stream.match(/^\s+/)) return null;
      if (stream.eat("{")) {
        const keyed = state.type == null || !NON_KEYED_BIB_TYPES.has(state.type);
        state.phase = keyed ? "key" : "fields";
        state.depth = 0;
        return "bracket";
      }
      state.phase = "top"; // no brace — the @word was not an entry header
    }

    if (state.phase === "key") {
      if (stream.match(/^\s+/)) return null;
      if (stream.eat("}")) { state.phase = "top"; return "bracket"; } // @type{} empty
      if (stream.eat(",")) { state.phase = "fields"; return "bracket"; } // key done
      if (stream.match(/[^\s,{}"=]+/)) return "citation"; // the entry key
      state.phase = "fields";
      stream.next();
      return null;
    }

    if (state.phase === "fields") {
      if (stream.eat("}")) {
        if (state.depth > 0) { state.depth--; return "bracket"; } // value group closed
        state.phase = "top";
        return "bracket";
      }
      if (state.depth > 0) {
        // Inside a multi-line string value: prose until the group closes.
        if (stream.eat("{")) state.depth++;
        else stream.next();
        return null;
      }
      if (stream.match(/^\s+/)) return null;
      if (stream.eat(",")) return "bracket";
      const m = stream.match(/[a-zA-Z][a-zA-Z0-9_-]*/);
      if (m) {
        const save = stream.start;
        if (stream.match(/^\s*=/)) return "keyword"; // field name
        stream.pos = save; // plain word, not a field — tokenize as text
      }
      if (stream.eat("{")) { state.depth++; return "bracket"; } // value opens; interior is prose
      if (stream.eat('"')) { stream.match(/^[^"\n]*/); stream.eat('"'); return null; }
      if (stream.eat("<")) { stream.match(/^[^>\n]*>/) || stream.skipToEnd(); return null; }
      stream.next();
      return null;
    }

    // top level
    if (stream.match(/^\s+/)) return null;
    if (stream.eat("@")) {
      const m = stream.match(/[a-zA-Z*]+/) as RegExpMatchArray | null;
      if (m) {
        state.type = m[0].toLowerCase();
        state.phase = "afterType";
        return STANDARD_BIB_TYPES.has(state.type) ? "keyword.special" : "keyword";
      }
      return "bracket"; // bare @ — punctuation
    }
    stream.next();
    return null;
  },
});