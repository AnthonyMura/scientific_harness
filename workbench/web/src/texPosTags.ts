// Paragraph position tags (issue 30): a low-contrast marker like S2SS3P4L128
// rendered on its own line above the first line of every .tex text paragraph.
// Pure overlay — block CodeMirror line widgets styled by CSS (styles.css).
// The tag never enters the document: compilation, search, and the saved file
// are unaffected. Block decorations must come from a state field, not a view
// plugin (CM6 rejects plugin-provided block decorations), so the set lives in
// a StateField that provides EditorView.decorations.
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { computeParagraphTags } from "./latexStructure";

export interface TexPosTagOptions {
  /** Current setting value, read on every transaction so toggles apply live. */
  getEnabled: () => boolean;
}

/** The marker itself: a block line rendered above the tagged paragraph's first line. */
class PosTagWidget extends WidgetType {
  constructor(private tag: string) { super(); }
  eq(other: PosTagWidget) { return this.tag === other.tag; }
  toDOM() {
    const el = document.createElement("div");
    el.className = "tex-pos-tag";
    el.dataset.tag = this.tag;
    // Render as S1 · SS1 · P2 · L24 — bold letter prefixes, faint
    // separators — so the four counters read as distinct groups at a glance.
    const m = /^S(\d+)SS(\d+)P(\d+)L(\d+)$/.exec(this.tag);
    if (m) {
      let first = true;
      for (const [prefix, num] of [["S", m[1]], ["SS", m[2]], ["P", m[3]], ["L", m[4]]]) {
        if (!first) {
          const sep = document.createElement("span");
          sep.className = "tex-pos-sep";
          sep.textContent = "·";
          el.appendChild(sep);
        }
        first = false;
        const b = document.createElement("b");
        b.textContent = prefix;
        el.appendChild(b);
        el.appendChild(document.createTextNode(num));
      }
    } else {
      el.textContent = this.tag;
    }
    return el;
  }
}

const lineTag = (tag: string) => Decoration.widget({ widget: new PosTagWidget(tag), side: -1, block: true });

function build(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;
  const tags = computeParagraphTags(state.doc.toString());
  if (!tags.size) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  for (const [line, tag] of tags) {
    const from = state.doc.line(line).from;
    // Marker above the line, plus a faint highlight on the tagged line itself.
    ranges.push(lineTag(tag).range(from));
    ranges.push(Decoration.line({ class: "tex-pos-line" }).range(from));
  }
  // Map iteration is document order — skip the set's sort.
  return Decoration.set(ranges, false);
}

/** State-field extension that renders the position-tag overlay for .tex files. */
export function texPosTagsPlugin(opts: TexPosTagOptions) {
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
    // Without this the field holds a set nothing renders. from(field) — not
    // .of(fn) — computes a concrete set per state, which is what allows block
    // decorations (function-provided sets are reserved for inline marks).
    provide: (f) => [EditorView.decorations.from(f)],
  });
  return field;
}
