// Project bibliography index behind the citation-key autocomplete: every
// .bib file in the project is parsed once per change, and \citep{…} & kin
// list the keys with a short author/year hint. The index is a module
// singleton — the completion source reads it synchronously, EditorPane
// keeps it fresh (on project open and after every bib save).

import { api } from "./api";
import { citationHint, scanBibEntries } from "./bibFormat";

export interface BibCitation {
  key: string;
  type: string;
  /** Short hint for the overlay row: "Smith et al., 2023". */
  hint: string;
  /** Project-relative .bib file the entry came from. */
  file: string;
}

class BibIndex {
  private root: string | null = null;
  private entries: BibCitation[] = [];
  private inflight: Promise<void> | null = null;
  private seq = 0;

  /** True once the current project's bibliography has loaded at least once. */
  get ready(): boolean {
    return this.root !== null;
  }

  all(): readonly BibCitation[] {
    return this.entries;
  }

  /** (Re)load the bibliography for `root`; force re-reads after a save. */
  refresh(root: string, force = false): void {
    if (this.root === root && !force) return; // already current
    const my = ++this.seq;
    const prev = this.inflight ?? Promise.resolve();
    this.inflight = prev.then(async () => {
      if (this.root !== root) {
        this.entries = []; // project switched — never show a stale list
      }
      const files = (await api.bibFiles()).files;
      const out: BibCitation[] = [];
      for (const f of files) {
        try {
          const r = await api.readFile(f);
          for (const e of scanBibEntries(r.content)) {
            if (!e.key) continue;
            out.push({ key: e.key, type: e.type, hint: citationHint(e.type, e.fields), file: f });
          }
        } catch {
          // Unreadable file — skip it rather than lose the whole index.
        }
      }
      if (my !== this.seq) return; // superseded by a newer refresh
      this.root = root;
      this.entries = out;
    }).catch(() => {
      if (my === this.seq) {
        this.root = null;
        this.entries = [];
      }
    });
  }
}

export const bibIndex = new BibIndex();