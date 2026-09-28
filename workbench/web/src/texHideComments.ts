// Hide .tex comment lines (issue 39): a display-only toggle. Every full-line
// comment — a line whose first non-whitespace character is `%` — gets its
// content replaced with an empty range and its line collapsed to zero height,
// so the text disappears from view while the document state stays untouched:
// compile, syncTeX, autosave and the saved file all keep working against the
// real lines. The gutter number of a hidden line is hidden via a class on its
// gutter cell (the `gutterLineClass` facet), so the remaining numbers stay at
// their true document positions — 1, 2, 4, 5… with gaps — exactly what
// pdflatex errors and syncTeX report.
//
// Verbatim environments: inside `\begin{verbatim}…\end{verbatim}` (and friends)
// a `%` line is literal content, not a comment, so detection skips lines inside
// such environments. Each `\begin{env}` is scanned individually (not as
// non-overlapping pairs), so a verbatim block nested in e.g. `document` is
// still found; v1 limitation: the first following `\end{env}` closes the range
// and unbalanced begins are skipped.
//
// Search: while hiding is on, hidden lines are excluded from find/replace/
// select-all by injecting the official `SearchQuery.test` filter into the active
// query; it is stripped again when nothing is hidden. The user sees a hint under
// the settings toggle plus a "comments hidden" chip in the pane header.

import { StateField, RangeSet, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, GutterMarker, gutterLineClass, type DecorationSet, EditorView } from "@codemirror/view";
import { SearchQuery, getSearchQuery, setSearchQuery } from "@codemirror/search";

/** A full-line comment: first non-whitespace character is `%`. */
const COMMENT_LINE = /^\s*%/;

/** Every `\begin{env}` occurrence (name captured). */
const ENV_BEGIN = /\\begin\{([A-Za-z][A-Za-z0-9*]*)\}/g;

/** Environments whose content is literal — `%` there is not a comment. */
function isLiteralEnv(name: string): boolean {
  return (
    name.includes("verbatim") ||
    name === "comment" ||
    name === "luacode" ||
    name === "luacode*"
  );
}

/** [from, to) ranges of literal-content environments in the given text. */
function literalRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  ENV_BEGIN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_BEGIN.exec(text))) {
    const name = m[1];
    if (!isLiteralEnv(name)) continue;
    const endTag = "\\end{" + name + "}";
    const endIdx = text.indexOf(endTag, m.index);
    if (endIdx < 0) continue; // unbalanced begin — v1 limitation: skip it
    out.push([m.index, endIdx + endTag.length]);
  }
  return out;
}

/** Empties a line's content. */
const HIDDEN = Decoration.replace({});
/** Tags the (collapsed) line for CSS. */
const HIDDEN_LINE = Decoration.line({ class: "cm-hidden-comment-line" });

/** Class marker for the gutter cell of a hidden line. */
class HiddenLineMarker extends GutterMarker {
  elementClass = "cm-hidden-comment-gutter";
}
const HIDDEN_MARKER = new HiddenLineMarker();

function build(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  const vb = literalRanges(state.doc.toString());
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (!COMMENT_LINE.test(line.text)) continue;
    // Skip lines inside a verbatim-like environment: their `%` is content.
    if (vb.some(([a, b]) => line.from >= a && line.from < b)) continue;
    // Cover the line's own span only — never the trailing newline, which would
    // merge this line with the next one in the render.
    ranges.push(HIDDEN.range(line.from, line.to));
    ranges.push(HIDDEN_LINE.range(line.from));
  }
  // `sort` defaults to false in CM6 — pass it explicitly: the replace spans
  // (startSide ≈ +5e8) and line tags (startSide 0) share each `from`, so push
  // order does not satisfy the (from, startSide) invariant.
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

function withFilter(q: SearchQuery, test: NonNullable<SearchQuery["test"]>): SearchQuery {
  return new SearchQuery({
    search: q.search,
    caseSensitive: q.caseSensitive,
    literal: q.literal,
    regexp: q.regexp,
    replace: q.replace,
    wholeWord: q.wholeWord,
    test,
  });
}

function stripFilter(q: SearchQuery): SearchQuery {
  return new SearchQuery({
    search: q.search,
    caseSensitive: q.caseSensitive,
    literal: q.literal,
    regexp: q.regexp,
    replace: q.replace,
    wholeWord: q.wholeWord,
  });
}

export interface TexHideCommentsOptions {
  /** Current setting value, read on every transaction so toggles apply live. */
  getEnabled: () => boolean;
}

/** State-field extension that hides full-line comments for .tex files and keeps
 *  the search filter in sync with the hidden set. */
export function texHideCommentsPlugin(opts: TexHideCommentsOptions): Extension {
  let lastEnabled: boolean | null = null;
  const field = StateField.define<DecorationSet>({
    create: (state) => {
      lastEnabled = opts.getEnabled();
      return build(state, lastEnabled);
    },
    update(value, tr) {
      const enabled = opts.getEnabled();
      if (tr.docChanged || enabled !== lastEnabled) {
        lastEnabled = enabled;
        return build(tr.state, enabled);
      }
      return value;
    },
    provide: (f) => [
      EditorView.decorations.from(f),
      // Put a class marker on the gutter cell of every hidden line so CSS can
      // hide its number (the row itself is collapsed by .cm-hidden-comment-line).
      gutterLineClass.compute([f], (state) => {
        const markers: Range<GutterMarker>[] = [];
        const it = state.field(f).iter();
        while (it.value !== null) {
          if (it.value == HIDDEN_LINE) markers.push(HIDDEN_MARKER.range(it.from));
          it.next();
        }
        return RangeSet.of(markers);
      }),
    ],
  });

  // Search filter: reject matches that overlap a hidden comment line. It reads
  // the field live at match time, so it is always current without re-dispatching
  // on every document change.
  const guardTest = (
    _match: string,
    state: EditorState,
    from: number,
    to: number,
  ): boolean => {
    const set = state.field(field);
    if (set.size === 0) return true;
    const it = set.iter();
    while (it.value !== null) {
      if (it.from >= to) break; // ranges are sorted — no later overlap possible
      if (it.to > from) return false;
      it.next();
    }
    return true;
  };

  // Keep the search query's `test` filter in sync with the hidden set. The
  // filter itself needs no refresh on doc changes (it reads the field live), so
  // only two events re-dispatch: a new/changed query (setSearchQuery effect) and
  // the hidden set flipping between empty and non-empty (e.g. last comment
  // deleted, or the toggle itself). Both dispatches are idempotent — after one,
  // `cur.test` already equals (or no longer equals) guardTest.
  let lastEmpty: boolean | null = null;
  const guard = EditorView.updateListener.of((u) => {
    const set = u.state.field(field);
    const empty = set.size === 0;
    const flipped = lastEmpty !== null && empty !== lastEmpty;
    if (lastEmpty === null) lastEmpty = empty;
    const hasQueryEffect = u.transactions.some((tr) =>
      tr.effects.some((e) => e.is(setSearchQuery)),
    );
    if (!flipped && !hasQueryEffect) return;
    const cur = getSearchQuery(u.state);
    if (empty) {
      // Nothing hidden: make sure the filter is off.
      if (cur.test === guardTest) {
        u.view.dispatch({ effects: [setSearchQuery.of(stripFilter(cur))] });
      }
      return;
    }
    // Hidden lines exist: make sure the filter is on.
    if (cur.test !== guardTest) {
      u.view.dispatch({ effects: [setSearchQuery.of(withFilter(cur, guardTest))] });
    }
  });

  return [field, guard];
}
