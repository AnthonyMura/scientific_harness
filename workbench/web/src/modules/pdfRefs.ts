// PDF reference data (issue 27): resolves citation numbers to structured
// reference info (title / authors / DOI) for the hover tooltip in the PDF pane.
// Compiled-output mode reads the project's own sources — the build .aux
// (citation number → bib key, bibliography file names) plus the .bib entries,
// or the generated .bbl text when no .bib is present. When nothing can be
// read, the viewer falls back to the reference entry text parsed from the PDF
// itself (pdfCitations.scanBibliography). No backend changes: api.fetchRawFile
// already serves any project file.

/** Structured info for one citation number — the tooltip's content. */
export interface RefInfo {
  key?: string; // bib key, when known
  title?: string;
  authors?: string;
  doi?: string;
  raw?: string; // entry text as printed (bbl / PDF fallback)
}

/** Citation number → reference info. */
export type RefMap = Map<number, RefInfo>;

// --- aux parsing -------------------------------------------------------------

/** What the build .aux tells us: number → key for numbered styles, the
 *  bibliography file names (\bibdata), and \bibitem order (fallback). */
export interface AuxParse {
  numberToKey: Map<number, string>;
  bibNames: string[];
  bibitemOrder: string[];
}

// natbib writes two forms in the wild:
//   numbers style:  \bibcite{doe2020}{{1}{2020}{{Doe}}{{}}}
//   author-year:    \bibcite{smith2023}{Smith et~al.(2023)}
// The value may hold one level of nested groups (the numbers form); the
// citation number is the first inner group there, or the whole flat value.
const BIBCITE_RE = /\\bibcite\{([^{}]+)\}\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
const BIBITEM_RE = /\\bibitem(?:\[[^\]]*\]|\{[^{}]*\})?\s*\{([^{}]+)\}/g;
const BIBDATA_RE = /\\bibdata(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;

/** Parse a .aux file: \bibcite{key}{...} with a purely numeric citation
 *  number → number→key (numbered styles only — an author-year label argument
 *  is ignored), \bibitem{key} order as the numbering fallback, and \bibdata
 *  names. */
export function parseAux(text: string): AuxParse {
  const numberToKey = new Map<number, string>();
  const bibitemOrder: string[] = [];
  let m: RegExpExecArray | null;

  BIBCITE_RE.lastIndex = 0;
  while ((m = BIBCITE_RE.exec(text))) {
    const key = m[1].trim();
    if (!key) continue;
    const val = m[2];
    let num = "";
    if (/^\{/.test(val)) {
      // Nested numbers form: the first inner group is the citation number.
      const inner = /^\{\s*(\d+)\s*\}/.exec(val);
      if (!inner) continue;
      num = inner[1];
    } else if (/^\d+$/.test(val.trim())) {
      num = val.trim(); // simple flat form
    } else {
      continue; // author-year label — not a number
    }
    const n = parseInt(num, 10);
    if (n > 0) numberToKey.set(n, key);
  }

  BIBITEM_RE.lastIndex = 0;
  while ((m = BIBITEM_RE.exec(text))) {
    const key = m[1].trim();
    if (key) bibitemOrder.push(key);
  }

  const bibNames: string[] = [];
  BIBDATA_RE.lastIndex = 0;
  while ((m = BIBDATA_RE.exec(text))) {
    for (const part of m[1].split(",")) {
      let name = part.trim().replace(/\\/g, "/");
      if (!name) continue;
      name = name.slice(name.lastIndexOf("/") + 1); // directory → basename
      const dot = name.lastIndexOf(".");
      if (dot > 0 && name.slice(dot).toLowerCase() === ".bib") name = name.slice(0, dot);
      if (name && !bibNames.includes(name)) bibNames.push(name);
    }
  }

  return { numberToKey, bibNames, bibitemOrder };
}

// --- BibTeX parsing ------------------------------------------------------------

/** The fields we keep from one @entry (values normalized: outer braces
 *  stripped, whitespace collapsed). */
export interface BibFields {
  author?: string;
  title?: string;
  doi?: string;
  journal?: string;
  year?: string;
}

/** Parse a .bib file into key → fields. A small brace-depth scanner: values
 *  may span lines and be braced, quoted, or bare; % comments are skipped at
 *  the top level; @string/@comment entries and malformed constructs are
 *  resynced at the next @. */
export function parseBibtex(text: string): Map<string, BibFields> {
  const out = new Map<string, BibFields>();
  const n = text.length;
  let i = 0;

  const skipWsComments = (j: number) => {
    while (j < n) {
      const c = text[j];
      if (c === "%") {
        while (j < n && text[j] !== "\n") j++;
      } else if (/\s/.test(c)) {
        j++;
      } else break;
    }
    return j;
  };

  while (i < n) {
    i = skipWsComments(i);
    if (text[i] !== "@") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && /[A-Za-z*]/.test(text[j])) j++;
    const type = text.slice(i + 1, j);
    if (!type) {
      i++;
      continue;
    }
    j = skipWsComments(j);
    if (text[j] !== "{") {
      i = j < n ? j + 1 : n; // @ without a body — resync
      continue;
    }
    j++;
    let keyStart = j;
    while (j < n && text[j] !== "," && text[j] !== "}") j++;
    const key = text.slice(keyStart, j).trim();
    if (!key) {
      i = j + 1; // malformed entry — resync at the next @
      continue;
    }
    if (text[j] === ",") j++;

    const fields: Record<string, string> = {};
    for (;;) {
      j = skipWsComments(j);
      if (j >= n || text[j] === "}") break;
      if (text[j] === ",") {
        j++;
        continue;
      }
      const fStart = j;
      while (j < n && text[j] !== "=" && text[j] !== "," && text[j] !== "}") j++;
      const fname = text.slice(fStart, j).trim().toLowerCase();
      if (text[j] !== "=" || !fname) break; // not a field — give up on this entry
      j++; // past '='
      j = skipWsComments(j);
      if (j >= n) break;
      let value = "";
      if (text[j] === "{") {
        let depth = 0;
        const vStart = j;
        for (;;) {
          const c = text[j];
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              j++;
              break;
            }
          }
          j++;
          if (j >= n) break;
        }
        value = text.slice(vStart + 1, Math.min(j - 1, n));
      } else if (text[j] === '"') {
        const vStart = j + 1;
        j++;
        while (j < n && !(text[j] === '"' && text[j - 1] !== "\\")) j++;
        value = text.slice(vStart, j).replace(/\\"/g, '"');
        if (j < n) j++; // past the closing quote
      } else {
        const vStart = j;
        while (j < n && text[j] !== "," && text[j] !== "}") j++;
        value = text.slice(vStart, j);
      }
      if (fname && !(fname in fields)) fields[fname] = normalizeValue(value);
    }

    const f: BibFields = {};
    for (const k of ["author", "title", "doi", "journal", "year"]) {
      const v = fields[k];
      if (v) (f as Record<string, string>)[k] = v;
    }
    if (Object.keys(f).length > 0) out.set(key, f);
    i = j;
  }
  return out;
}

/** Strip one layer of surrounding braces (only when it is balanced at depth 0)
 *  and collapse whitespace runs — a value may span lines in the source. */
export function normalizeValue(v: string): string {
  let s = v.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    let depth = 0;
    let balancedOuter = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") {
        depth--;
        if (depth === 0 && i < s.length - 1) {
          balancedOuter = false;
          break;
        }
      }
    }
    if (balancedOuter) s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

// --- bbl parsing -----------------------------------------------------------------

/** \bibitem keys in order + key → entry text as printed: the lines between
 *  this \bibitem and the next one, whitespace-normalized. */
export function parseBbl(text: string): { order: string[]; rawByKey: Map<string, string> } {
  const re = /\\bibitem(?:\[[^\]]*\]|\{[^{}]*\})?\s*\{([^{}]+)\}/g;
  const marks: { key: string; matchStart: number; textStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[1].trim();
    if (key) marks.push({ key, matchStart: m.index, textStart: m.index + m[0].length });
  }
  const order: string[] = [];
  const rawByKey = new Map<string, string>();
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].matchStart : text.length;
    // The final entry runs to the end of the file — stop at the closing
    // section command (\end{thebibliography}) so it never leaks in.
    let raw = "";
    for (const line of text.slice(marks[i].textStart, end).split("\n")) {
      if (/^\s*\\end\{/.test(line)) break;
      raw += line + " ";
    }
    raw = raw.replace(/\s+/g, " ").trim();
    if (raw && !rawByKey.has(marks[i].key)) {
      order.push(marks[i].key);
      rawByKey.set(marks[i].key, raw);
    }
  }
  return { order, rawByKey };
}

// --- assembly ------------------------------------------------------------------------

/** 1-based numbering from an ordered key list (the \bibitem fallback). */
export function orderToNumberMap(order: string[]): Map<number, string> {
  const out = new Map<number, string>();
  order.forEach((key, i) => {
    if (!out.has(i + 1)) out.set(i + 1, key);
  });
  return out;
}

/** Merge number→key with the bib fields / bbl raw text into the tooltip's
 *  RefMap. A number whose key is unknown keeps just the key — the tooltip
 *  then has nothing structured and falls back to the PDF's own entry text. */
export function assembleRefMap(
  numberToKey: Map<number, string>,
  bibByKey: Map<string, BibFields> | null,
  rawByKey: Map<string, string> | null,
): RefMap | null {
  if (numberToKey.size === 0) return null;
  const out: RefMap = new Map();
  for (const [n, key] of numberToKey) {
    const info: RefInfo = { key };
    const bib = bibByKey?.get(key);
    if (bib) {
      if (bib.title) info.title = bib.title;
      if (bib.author) info.authors = bib.author;
      if (bib.doi) info.doi = bib.doi;
    } else {
      const raw = rawByKey?.get(key);
      if (raw) info.raw = raw;
    }
    out.set(n, info);
  }
  return out;
}

// --- fetch orchestration -----------------------------------------------------------------

const BUILD_DIR = ".workbench/build";

// The api client is imported lazily so this module stays importable from the
// Node verification harness (which only exercises the pure parsers). Vite
// merges it into the same chunk as the rest of the app.
async function readText(path: string): Promise<string | null> {
  try {
    const { api } = await import("../api");
    const blob = await api.fetchRawFile(path);
    if (!blob) return null;
    return await blob.text();
  } catch {
    return null; // missing / refused — the chain degrades silently
  }
}

/** Shallow scan (project root + build dir, hidden included) for *.suffix. */
async function findFiles(suffix: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of ["", BUILD_DIR]) {
    try {
      const { api } = await import("../api");
      const t = await api.tree(dir, true);
      for (const e of t.entries) if (!e.is_dir && e.name.endsWith(suffix)) out.push(e.path);
    } catch {
      /* no such directory */
    }
  }
  return out;
}

/** Load the reference data for a compiled PDF: .aux → number→key + bib names,
 *  then the .bib entries (at the root or in the build dir, else a shallow
 *  scan), else the generated .bbl text. Resolves to null when nothing could
 *  be read — the viewer then falls back to the entry text parsed from the PDF
 *  itself. Fetching is expected to run once per (pdfVersion, stem). */
export async function loadCompiledRefs(stem: string): Promise<RefMap | null> {
  const aux = parseAux((await readText(`${BUILD_DIR}/${stem}.aux`)) ?? "");

  // .bib candidates: the \bibdata names at the root and in the build dir, or a
  // shallow scan for any .bib when the aux named none.
  let bibPaths = [...new Set(aux.bibNames.flatMap((n) => [`${n}.bib`, `${BUILD_DIR}/${n}.bib`]))];
  if (bibPaths.length === 0) bibPaths = await findFiles(".bib");

  const bibByKey = new Map<string, BibFields>();
  for (const p of bibPaths) {
    const text = await readText(p);
    if (!text) continue;
    for (const [k, v] of parseBibtex(text)) if (!bibByKey.has(k)) bibByKey.set(k, v);
  }

  let numberToKey = aux.numberToKey;
  if (numberToKey.size === 0 && aux.bibitemOrder.length > 0) {
    numberToKey = orderToNumberMap(aux.bibitemOrder);
  }

  if (bibByKey.size > 0) {
    const map = assembleRefMap(numberToKey, bibByKey, null);
    if (map) return map;
  }

  // No .bib — the generated .bbl carries the entry text as printed.
  let bblPaths = aux.bibNames.map((n) => `${BUILD_DIR}/${n}.bbl`);
  if (bblPaths.length === 0) bblPaths = await findFiles(".bbl");
  const rawByKey = new Map<string, string>();
  const bblOrder: string[] = [];
  for (const p of bblPaths) {
    const text = await readText(p);
    if (!text) continue;
    const parsed = parseBbl(text);
    for (const k of parsed.order) if (!rawByKey.has(k)) bblOrder.push(k);
    for (const [k, v] of parsed.rawByKey) if (!rawByKey.has(k)) rawByKey.set(k, v);
  }
  if (rawByKey.size > 0) {
    if (numberToKey.size === 0 && bblOrder.length > 0) numberToKey = orderToNumberMap(bblOrder);
    const map = assembleRefMap(numberToKey, null, rawByKey);
    if (map) return map;
  }

  return null;
}
