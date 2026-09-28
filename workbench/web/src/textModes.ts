import { StreamLanguage } from "@codemirror/language";

/**
 * Lightweight StreamLanguage modes for the common text formats the editor
 * opens (issue 21): JSON, YAML, TOML, INI-style config, and XML/HTML.
 * Follows the latexMode.ts pattern — no new npm dependencies, and tokens use
 * only the tag classes the Vesper highlight set already styles: comments
 * brown italic, keys sand keywords, structural headers ([section], [table],
 * ---, true/false/null) gold-bright semibold, delimiters taupe. String
 * values and numbers stay default prose — in a writing app, data content
 * reads like text.
 */

/** JSON: object keys sand, true/false/null gold-bright, delimiters taupe;
 *  string values and numbers are prose. Keys are detected by the colon that
 *  follows a string (the only place a string may be a key in JSON). */
export const jsonLanguage = StreamLanguage.define({
  name: "json",
  token(stream) {
    if (stream.eatSpace()) return null;
    const ch = stream.peek();
    if (ch === '"') {
      // Unterminated string: consume to end of line as prose (invalid JSON,
      // but the tokenizer must keep moving).
      if (!stream.match(/"[^"\\]*(?:\\.[^"\\]*)*"/)) {
        stream.skipToEnd();
        return null;
      }
      const save = stream.pos;
      stream.eatSpace();
      if (stream.peek() === ":") return "keyword"; // object key
      stream.pos = save;
      return null; // string value — default prose
    }
    if (stream.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return null; // number — prose
    if (stream.match(/true|false|null/)) return "keyword.special";
    if (stream.eat(/[{}[\],:]/)) return "bracket";
    stream.next(); // stray character (invalid JSON) — consume, keep moving
    return null;
  },
});

/** YAML (subset): keys sand (a word or quoted string followed by a colon at
 *  key position), booleans/null gold-bright, # comments brown italic, list
 *  dashes and --- document separators structural. Plain scalars are prose. */
export const yamlLanguage = StreamLanguage.define({
  name: "yaml",
  token(stream) {
    if (stream.eatSpace()) return null;
    // A # at line start or after whitespace is a comment; a # glued to a
    // scalar (e.g. a URL fragment) is literal text.
    if (stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    // Key position: line start, or right after a list dash (only whitespace
    // and dashes before us on this line).
    const atKeyPos = /^[\s-]*$/.test(stream.string.slice(0, stream.start));
    if (atKeyPos && stream.match(/^---/)) return "keyword.special"; // document separator
    if (stream.eat("-")) {
      const c = stream.peek();
      if (c === undefined || /\s/.test(c)) return "bracket"; // list item marker
      stream.pos--; // minus glued to a scalar (e.g. -123) — re-tokenize below
    }
    // Quoted string: a key when followed by ':', a value otherwise.
    if (stream.match(/"[^"\n]*"/) || stream.match(/'[^'\n]*'/)) {
      const save = stream.pos;
      stream.eatSpace();
      if (stream.peek() === ":") return "keyword";
      stream.pos = save;
      return null; // string value — prose
    }
    // Bare key at key position: a word followed by ':'.
    if (atKeyPos && stream.match(/[A-Za-z0-9_.\-]+/)) {
      const save = stream.pos;
      stream.eatSpace();
      if (stream.peek() === ":") return "keyword";
      stream.pos = save; // not a key — tokenize the word as plain text below
    }
    if (stream.match(/^(true|false|null)(?=\s|$)/)) return "keyword.special";
    if (stream.match(/^~(?=\s|$)/)) return "keyword.special";
    // Plain scalar or other content: prose until whitespace or a structural char.
    if (stream.eatWhile(/[^\s:#"'{}[\],&*!|>%@`]/)) return null;
    stream.next();
    return null;
  },
});

/** TOML: [table] / [[array of tables]] headers gold-bright, keys sand,
 *  true/false gold-bright, delimiters taupe; strings, numbers and dates are
 *  prose. A header is a line whose first non-space character is '[' — the
 *  whole run to the closing bracket(s) is structural. */
export const tomlLanguage = StreamLanguage.define({
  name: "toml",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    if (/^\s*$/.test(stream.string.slice(0, stream.start)) && stream.peek() === "[") {
      if (!stream.skipTo("]")) stream.skipToEnd();
      else stream.next();
      return "keyword.special"; // [table] / [[array of tables]] header
    }
    // Bare or quoted key: a word (dotted parts allowed) followed by '='.
    if (stream.match(/[A-Za-z0-9_][A-Za-z0-9_.\-]*/) || stream.match(/"[^"\n]*"/) || stream.match(/'[^'\n]*'/)) {
      const save = stream.pos;
      stream.eatSpace();
      if (stream.peek() === "=") return "keyword"; // key
      stream.pos = save; // not a key — tokenize as a value below
    }
    if (stream.match(/true|false/)) return "keyword.special";
    if (stream.eat("=")) return "bracket";
    if (stream.match(/-?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return null; // number — prose
    if (stream.match(/"[^"\n]*(?:\\.[^"\n]*)*"/) || stream.match(/'[^'\n]*'/)) return null; // string value — prose
    if (stream.eat(/[{}[\],]/)) return "bracket";
    stream.next(); // dates, stray chars — consume, keep moving
    return null;
  },
});

/** INI-style config (.ini/.cfg/.conf): [section] headers gold-bright, keys
 *  sand (the word before '=' or ':'), ; and # comments brown italic. Once a
 *  line has its key separator, the rest of the line is value prose. */
export const iniLanguage = StreamLanguage.define({
  name: "ini",
  token(stream) {
    if (stream.eatSpace()) return null;
    const lineStart = stream.string.lastIndexOf("\n", stream.start - 1) + 1;
    const soFar = stream.string.slice(lineStart, stream.start);
    if (stream.peek() === ";" || stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    // After the key separator on this line: value prose to end of line
    // (stopping at a trailing ';' so a comment can still be recognized).
    if (/[:=]/.test(soFar)) {
      stream.eatWhile(/[^\n;]/);
      return null;
    }
    // [section] header: first non-space character on the line is '['.
    if (/^\s*$/.test(soFar) && stream.peek() === "[") {
      if (!stream.skipTo("]")) stream.skipToEnd();
      else stream.next();
      return "keyword.special";
    }
    // Key: a run of non-space characters before '=' or ':'.
    if (stream.match(/^[^\s=;#:]+/)) {
      const save = stream.pos;
      stream.eatSpace();
      if (stream.eat(/[=:]/)) return "keyword";
      stream.pos = save; // no separator — plain text, prose
      return null;
    }
    if (stream.eat(/[=,]/)) return "bracket";
    stream.next();
    return null;
  },
});

/** XML/HTML (shared by .xml/.svg-as-text/.html/.htm): tag names and
 *  attribute names sand, comments brown italic (may span lines), CDATA
 *  content prose with taupe markers, markup punctuation taupe. Text content
 *  is default prose. */
export const xmlLanguage = StreamLanguage.define<{ comment?: boolean; cdata?: boolean }>({
  name: "xml",
  startState: () => ({}),
  token(stream, state) {
    for (;;) {
      if (state.comment) {
        // The text run must stop before "-" so an exact "-->" close check is
        // possible at every position (stream.current() spans back to the
        // token start, so it cannot be used for the comparison).
        const m = stream.match(/^-->|[^<>-]+/) as RegExpMatchArray | null;
        if (m) {
          if (m[0] === "-->") state.comment = false;
          return "comment";
        }
        stream.next(); // stray <, > or dash — consume one char, re-check
        return "comment";
      }
      if (state.cdata) {
        // Same idea: the run stops before "]" so "]]>" is always testable.
        const m = stream.match(/^]]>|[^<\]]+/) as RegExpMatchArray | null;
        if (m) {
          if (m[0] === "]]>") {
            state.cdata = false;
            return "bracket";
          }
          return null; // CDATA content — prose
        }
        stream.next(); // stray ] or < inside CDATA — consume one char
        return null;
      }
      if (stream.eatSpace()) return null;
      if (stream.match(/<!--/)) {
        state.comment = true;
        continue;
      }
      if (stream.match(/<!\[CDATA\[/i)) {
        state.cdata = true;
        continue;
      }
      if (stream.match(/<!DOCTYPE[^>]*>/i)) return "keyword"; // doctype — sand
      if (stream.match(/<\/?[A-Za-z][\w.:-]*/)) return "keyword"; // <tag / </tag
      if (stream.match(/[A-Za-z_][\w.:-]*(?=\s*=)/)) return "keyword"; // attribute name
      if (stream.match(/"[^"]*"/) || stream.match(/'[^']*'/)) return null; // attribute value — prose
      if (stream.eat(/[<>=/!?&;]/)) return "bracket";
      stream.next(); // text content — prose
      return null;
    }
  },
});
