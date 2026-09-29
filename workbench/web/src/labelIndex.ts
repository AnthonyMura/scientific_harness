// Project-local label index behind the \ref{…} & kin autocomplete (ticket 44):
// every \label{key} in every .tex file, with a kind badge (figure / table /
// equation / section / other), a caption-or-snippet hint, and — after a
// successful compile — the real number and page read from the build's .aux
// files. The index is a module singleton mirroring bibIndex.ts: the
// completion source reads it synchronously, EditorPane keeps it fresh (on
// project open, after every .tex save, and when a compile finishes).

import { api } from "./api";

export type LabelKind = "figure" | "table" | "equation" | "section" | "other";

export interface LabelEntry {
  key: string;
  kind: LabelKind;
  /** Short hint for the overlay row: caption, section title, or snippet. */
  hint: string;
  /** Project-relative .tex file the label is defined in. */
  file: string;
  /** 1-based line number of the \label in `file`. */
  line: number;
  /** True when the same key is defined more than once in the project. */
  duplicate: boolean;
  /** Number from a fresh .aux ("3.2"); null until a compile fills it in. */
  number: string | null;
  /** Page from a fresh .aux ("2"); null when unknown. */
  page: string | null;
}

export interface ImageEntry {
  path: string;
  size: number; // bytes
}

// ---------------------------------------------------------------------------
// .tex scanning
// ---------------------------------------------------------------------------

const MATH_ENVS = new Set(["equation", "align", "gather", "multline", "eqnarray", "flalign"]);
const SECTION_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]\n]*\])?[ \t]*\{/;

interface RawLabel {
  key: string;
  kind: LabelKind;
  hint: string;
  file: string;
  line: number; // 1-based
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const truncate = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Brace-balanced argument of the first `re` match in `line`; null when the
 *  argument does not close on that line (v0 takes single-line arguments). */
function braceArg(line: string, re: RegExp): string | null {
  const m = re.exec(line);
  if (!m) return null;
  const start = m.index + m[0].length; // first char after the opening {
  let depth = 1;
  for (let i = start; i < line.length; i++) {
    if (line[i] === "{") depth++;
    else if (line[i] === "}") {
      depth--;
      if (depth === 0) return clean(line.slice(start, i));
    }
  }
  return null;
}

/** A short snippet for labels without a caption or heading: the label's own
 *  line (minus the \label call), extended with the next non-empty line. */
function snippet(lines: string[], idx: number): string {
  const strip = (s: string) => clean(s.replace(/\\label[ \t]*\{[^{}\n]*\}/g, ""));
  const own = strip(lines[idx] ?? "");
  if (own.length >= 4) return own;
  for (let i = idx + 1; i < lines.length && i <= idx + 3; i++) {
    const next = strip(lines[i]);
    if (next) return clean(own ? `${own} ${next}` : next);
  }
  return own || "(no caption)";
}

/** Line index of the \end{…} closing the environment opened at `from`
 *  (or end of file when it is never closed). */
function findEnvEnd(lines: string[], name: string, from: number): number {
  const re = new RegExp(`\\\\end[ \\t]*\\{${name}\\}`);
  for (let i = from + 1; i < lines.length; i++) if (re.test(lines[i])) return i;
  return lines.length - 1;
}

/** Nearest \caption{…} inside one float: forward from the label, then back. */
function findCaption(lines: string[], from: number, to: number, labelLine: number): string | null {
  const CAP = /\\caption(?:[ \t]*\[[^\]\n]*\])?[ \t]*\{/;
  for (let i = labelLine; i <= to; i++) {
    const c = braceArg(lines[i], CAP);
    if (c) return c;
  }
  for (let i = labelLine - 1; i >= from; i--) {
    const c = braceArg(lines[i], CAP);
    if (c) return c;
  }
  return null;
}

/** Every \label{key} in one .tex file, with kind + hint resolved locally. */
function scanTexLabels(file: string, content: string): RawLabel[] {
  const lines = content.split("\n");
  const out: RawLabel[] = [];
  const stack: Array<{ name: string; line: number }> = []; // open envs, innermost last
  let sectionTitle = "";
  let sectionLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Push \begin{…} first so a label on the same line sees its environment.
    for (const m of line.matchAll(/\\begin[ \t]*\{([a-zA-Z*]+)\}/g)) stack.push({ name: m[1], line: i });

    const secM = SECTION_RE.exec(line);
    if (secM) {
      sectionTitle = braceArg(line, SECTION_RE) ?? "";
      sectionLine = i;
    }

    for (const m of line.matchAll(/\\label[ \t]*\{([^{}\n]+)\}/g)) {
      const key = m[1].trim();
      if (!key) continue;
      const top = stack.length ? stack[stack.length - 1] : null;
      const inner = top ? top.name.replace(/\*$/, "") : null;

      let kind: LabelKind;
      if (inner === "figure") kind = "figure";
      else if (inner === "table") kind = "table";
      else if (inner !== null && MATH_ENVS.has(inner)) kind = "equation";
      // A heading label sits on the \section line itself or right after it.
      else if (i - sectionLine <= 1) kind = "section";
      else kind = "other";

      let hint: string;
      if ((kind === "figure" || kind === "table") && top) {
        const end = findEnvEnd(lines, top.name, i);
        const cap = findCaption(lines, top.line, end, i);
        hint = cap ?? (sectionTitle || snippet(lines, i));
      } else if (kind === "section") {
        hint = sectionTitle || snippet(lines, i);
      } else {
        hint = snippet(lines, i);
      }

      out.push({ key, kind, hint: truncate(hint), file, line: i + 1 });
    }

    // Pop \end{…} last so a label on the same line still counts as inside.
    for (const m of line.matchAll(/\\end[ \t]*\{([a-zA-Z*]+)\}/g)) {
      const name = m[1];
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].name === name) {
          stack.splice(s, 1);
          break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// .aux enrichment — numbers & pages after a successful compile
// ---------------------------------------------------------------------------

/** \newlabel{key}{{number}{page}{text}{anchor}{hyperpage}} — we only need the
 *  first two groups, so match the prefix and stop; anchoring the full tail
 *  (…}}) misses every real aux file, which always carries the extra groups. */
const NEWLABEL_RE = /\\newlabel\{([^{}\n]+)\}\{\{([^{}\n]*)\}\{([^{}\n]*)\}/g;

/** \newlabel{key}{{3.2}{2}} rows from one .aux file (unnumbered skipped). */
function parseAux(content: string): Map<string, { number: string; page: string }> {
  const out = new Map<string, { number: string; page: string }>();
  for (const m of content.matchAll(NEWLABEL_RE)) {
    if (m[2] || m[3]) out.set(m[1], { number: m[2], page: m[3] });
  }
  return out;
}

/** Merge every .aux in the build dir, newest file winning per key. */
async function readAuxNumbers(): Promise<Map<string, { number: string; page: string }>> {
  const tree = await api.tree(".workbench/build", true);
  const auxes = tree.entries
    .filter((e) => !e.is_dir && e.name.endsWith(".aux"))
    .sort((a, b) => a.mtime - b.mtime); // oldest first — newer files override
  const merged = new Map<string, { number: string; page: string }>();
  for (const e of auxes) {
    try {
      const r = await api.readFile(e.path);
      for (const [k, v] of parseAux(r.content)) merged.set(k, v);
    } catch {
      // no such aux yet — nothing to merge
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// The singleton
// ---------------------------------------------------------------------------

class LabelIndex {
  private root: string | null = null;
  private labels: LabelEntry[] = [];
  private texList: string[] = [];
  private bibList: string[] = [];
  private imageList: ImageEntry[] = [];
  /** True between a successful compile and the next .tex save: the build's
   *  .aux files reflect the current sources, so numbers/pages may be shown. */
  private auxFresh = false;
  private inflight: Promise<void> | null = null;
  private seq = 0;

  /** True once the current project's labels have loaded at least once. */
  get ready(): boolean {
    return this.root !== null;
  }

  all(): readonly LabelEntry[] {
    return this.labels;
  }

  texFiles(): readonly string[] {
    return this.texList;
  }

  bibFiles(): readonly string[] {
    return this.bibList;
  }

  imageFiles(): readonly ImageEntry[] {
    return this.imageList;
  }

  /** A compile just finished — the .aux files are fresh, re-read the index. */
  markAuxFresh(): void {
    if (!this.root) return; // nothing loaded yet; the next refresh will pick it up
    const root = this.root;
    const my = ++this.seq;
    this.auxFresh = true;
    const prev = this.inflight ?? Promise.resolve();
    this.inflight = prev.then(() => this.load(root, my)).catch(() => {
      if (my === this.seq) this.reset();
    });
  }

  /** (Re)load labels + file listings for `root`; force after a .tex save.
   *  A forced reload invalidates the aux: sources changed since the compile. */
  refresh(root: string, force = false): void {
    if (this.root === root && !force) return; // already current
    const my = ++this.seq;
    const prev = this.inflight ?? Promise.resolve();
    this.inflight = prev.then(async () => {
      if (this.root !== root) {
        // project switched — never show a stale list
        this.labels = [];
        this.texList = [];
        this.bibList = [];
        this.imageList = [];
        this.auxFresh = false;
      } else if (force) {
        this.auxFresh = false;
      }
      await this.load(root, my);
    }).catch(() => {
      if (my === this.seq) this.reset();
    });
  }

  private reset(): void {
    this.root = null;
    this.labels = [];
    this.texList = [];
    this.bibList = [];
    this.imageList = [];
    this.auxFresh = false;
  }

  private async load(root: string, my: number): Promise<void> {
    const [texRes, bibRes, imgRes] = await Promise.all([api.texFiles(), api.bibFiles(), api.imageFiles()]);
    const raw: RawLabel[] = [];
    for (const f of texRes.files) {
      try {
        const r = await api.readFile(f);
        raw.push(...scanTexLabels(f, r.content));
      } catch {
        // Unreadable file — skip it rather than lose the whole index.
      }
    }
    // Duplicates: LaTeX silently uses one definition; flag every row.
    const counts = new Map<string, number>();
    for (const l of raw) counts.set(l.key, (counts.get(l.key) ?? 0) + 1);

    let aux: Map<string, { number: string; page: string }> | null = null;
    if (this.auxFresh) aux = await readAuxNumbers().catch(() => null);

    if (my !== this.seq) return; // superseded by a newer refresh
    this.root = root;
    this.texList = texRes.files;
    this.bibList = bibRes.files;
    this.imageList = imgRes.files;
    this.labels = raw.map((l) => ({
      ...l,
      duplicate: (counts.get(l.key) ?? 0) > 1,
      number: aux?.get(l.key)?.number || null,
      page: aux?.get(l.key)?.page || null,
    }));
  }
}

export const labelIndex = new LabelIndex();
