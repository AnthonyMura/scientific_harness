// CodeMirror integration for spell check (issue 24): a brick wavy underline
// under every misspelled word. Decorations live in a StateField; the
// ViewPlugin owns the async recheck pipeline — debounced after typing,
// immediate on toggle / language switch.
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { findMisspelled, getChecker } from "./checker";

/** Dictionary load state for the pane-header note. */
export type SpellStatus = "idle" | "loading" | "ready" | "error";

const setSpellDeco = StateEffect.define<DecorationSet>();

/** Holds the current misspelling decorations (empty when spell check is off). */
export const spellDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setSpellDeco)) return e.value;
    return deco;
  },
});

const misspelledMark = Decoration.mark({ class: "sp-misspelled" });

export interface SpellcheckOptions {
  /** Current settings, read at every view update so toggles apply live. */
  getEnabled: () => boolean;
  getLang: () => string;
  /** Dictionary load progress for the pane-header note. */
  onStatus?: (status: SpellStatus) => void;
}

/** Recheck debounce after the last keystroke. */
const DEBOUNCE_MS = 250;

export function spellcheckPlugin(opts: SpellcheckOptions) {
  return ViewPlugin.fromClass(
    class {
      private enabled = false;
      private lang = "";
      private timer: number | null = null;
      /** Monotonic check id — a stale async result must not paint old marks. */
      private checkId = 0;
      /** EditorView.destroyed is private, so the plugin tracks its own liveness. */
      private dead = false;

      constructor(private view: EditorView) {
        this.enabled = opts.getEnabled();
        this.lang = opts.getLang();
        this.schedule(true); // first pass as soon as the view exists
      }

      update(u: ViewUpdate) {
        const enabled = opts.getEnabled();
        const lang = opts.getLang();
        if (enabled !== this.enabled || lang !== this.lang) {
          this.enabled = enabled;
          this.lang = lang;
          this.schedule(true); // settings changed — recheck right away
        } else if (u.docChanged) {
          this.schedule(false); // typing — debounce
        }
      }

      destroy() {
        this.dead = true;
        if (this.timer != null) window.clearTimeout(this.timer);
      }

      private schedule(immediate: boolean) {
        if (this.timer != null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
          this.timer = null;
          void this.run();
        }, immediate ? 0 : DEBOUNCE_MS);
      }

      private async run() {
        const view = this.view;
        if (!this.enabled) {
          opts.onStatus?.("idle");
          view.dispatch({ effects: setSpellDeco.of(Decoration.none) });
          return;
        }
        const id = ++this.checkId;
        const lang = this.lang;
        opts.onStatus?.("loading");
        try {
          const checker = await getChecker(lang);
          if (this.dead || id !== this.checkId) return; // stale or gone
          if (!this.enabled) {
            opts.onStatus?.("idle");
            view.dispatch({ effects: setSpellDeco.of(Decoration.none) });
            return;
          }
          const ranges = findMisspelled(view.state.doc.toString(), checker).map((r) =>
            misspelledMark.range(r.from, r.to),
          );
          view.dispatch({ effects: setSpellDeco.of(Decoration.set(ranges)) });
          opts.onStatus?.("ready");
        } catch {
          if (this.dead || id !== this.checkId) return; // stale or gone
          // Dictionary unavailable (offline / CDN down): no marks, surface it.
          view.dispatch({ effects: setSpellDeco.of(Decoration.none) });
          opts.onStatus?.("error");
        }
      }
    },
  );
}
