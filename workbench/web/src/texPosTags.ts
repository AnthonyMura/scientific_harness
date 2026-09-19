// Paragraph position tags (issue 30): a low-contrast marker like S2SS3P4L128
// rendered before the first line of every .tex text paragraph. Pure overlay —
// CodeMirror line decorations carrying a data attribute, styled by CSS ::before
// (styles.css). The tag never enters the document: compilation, search, and
// the saved file are unaffected.
import { type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { computeParagraphTags } from "./latexStructure";

export interface TexPosTagOptions {
  /** Current setting value, read on every view update so toggles apply live. */
  getEnabled: () => boolean;
}

const lineTag = (tag: string) =>
  Decoration.line({ class: "tex-pos-tag", attributes: { "data-tag": tag } });

export function texPosTagsPlugin(opts: TexPosTagOptions) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private enabled = false;

      constructor(view: EditorView) {
        this.enabled = opts.getEnabled();
        this.decorations = this.compute(view.state);
      }

      update(u: ViewUpdate) {
        const enabled = opts.getEnabled();
        if (enabled !== this.enabled || u.docChanged) {
          this.enabled = enabled;
          this.decorations = this.compute(u.state);
        }
      }

      private compute(state: EditorState): DecorationSet {
        if (!this.enabled) return Decoration.none;
        const tags = computeParagraphTags(state.doc.toString());
        if (tags.size === 0) return Decoration.none;
        // Map iteration is document order (ascending lines) — sorted ranges.
        const ranges: Range<Decoration>[] = [];
        for (const [line, tag] of tags) {
          ranges.push(lineTag(tag).range(state.doc.line(line).from));
        }
        return Decoration.set(ranges);
      }
    },
    {
      provide: (p) => EditorView.decorations.of((view) => view.plugin(p)!.decorations),
    },
  );
}
