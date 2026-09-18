/**
 * BibTeX pretty-printer — the same logic as JSON formatting: parse the file
 * into entries, then re-emit it canonically so every reference reads at a
 * glance. One field per line (2-space indent), whitespace inside values
 * collapsed to single spaces, one blank line between blocks; comments and
 * other non-entry text are preserved in place. Pure string → string with no
 * DOM or API access — Node-testable, and idempotent by construction.
 */

export interface BibField { name: string; value: string }

export interface BibEntry {
  type: string;
  key: string;
  fields: BibField[];
  /** Original text between the entry's outer braces (trimmed) — kept for
   *  non-keyed entries, which are re-emitted verbatim. */
  inner: string;
  /** Original source range [start, end) of the entry. */
  start: number;
  end: number;
}

/** Entry types that carry no key: @string/@comment/@preamble. Their bodies
 *  are re-emitted verbatim (comments may hold free text, not fields). */
export const NON_KEYED_BIB_TYPES = new Set(["string", "comment", "preamble"]);

/** Standard entry types — anything else is a custom style's type and still
 *  carries a key. Used for the highlight tier in bibMode. */
export const STANDARD_BIB_TYPES = new Set([
  "article", "book", "booklet", "inbook", "incollection", "inproceedings",
  "manual", "mastersthesis", "misc", "phdthesis", "proceedings", "techreport",
  "unpublished", "patent", "standard", "online", "dataset", "software",
]);

/** Scan `text` for brace-balanced @type{…} entries, in order of appearance. */
export function scanBibEntries(text: string): BibEntry[] {
  const out: BibEntry[] = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    const tm = /^[a-zA-Z*]+/.exec(text.slice(at + 1));
    if (!tm) { i = at + 1; continue; }
    const type = tm[0];
    let j = at + 1 + type.length;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== "{") { i = at + 1; continue; } // not an entry header
    let depth = 0;
    let e = j;
    for (; e < text.length; e++) {
      const c = text[e];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    if (e >= text.length) { i = at + 1; continue; } // unbalanced — skip
    const inner = text.slice(j + 1, e);
    let key = "";
    let fields: BibField[] = [];
    if (!NON_KEYED_BIB_TYPES.has(type.toLowerCase())) {
      let k = 0;
      while (k < inner.length && !/[,\s}]/.test(inner[k])) k++;
      key = inner.slice(0, k);
      const rest = key ? inner.slice(k).replace(/^,/, "") : inner;
      for (const part of splitTopLevel(rest, ",")) {
        const eq = part.indexOf("=");
        if (eq < 0) continue; // stray text — not a field
        const name = part.slice(0, eq).trim();
        const value = tidyValue(part.slice(eq + 1));
        if (!name || !value) continue;
        fields.push({ name, value });
      }
    }
    out.push({ type, key, fields, inner: inner.trim(), start: at, end: e + 1 });
    i = e + 1;
  }
  return out;
}

/** Split on `sep` occurring outside braces/quotes (value delimiters). */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let last = 0;
  for (let p = 0; p < s.length; p++) {
    const c = s[p];
    if (inQuote) {
      if (c === '"') inQuote = false; // quotes toggle, they do not nest
    } else if (c === '"') inQuote = true;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === sep && depth <= 0) { parts.push(s.slice(last, p)); last = p + 1; }
  }
  parts.push(s.slice(last));
  return parts.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** Trim a field value and collapse inner whitespace to single spaces. */
function tidyValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Re-emit one entry in the canonical layout (one field per line). */
export function renderEntry(en: BibEntry): string {
  if (!en.key) return `@${en.type}{${en.inner}}`; // non-keyed — keep verbatim
  if (!en.fields.length) return `@${en.type}{${en.key}}`;
  const body = en.fields.map((f) => `  ${f.name} = ${f.value}`).join(",\n");
  return `@${en.type}{${en.key},\n${body}\n}`;
}

/** Pretty-print a whole .bib file (the editor's Format action). */
export function formatBib(src: string): string {
  const entries = scanBibEntries(src);
  if (!entries.length) return src; // nothing to structure — leave untouched
  const lines: string[] = [];
  let cursor = 0;
  for (const en of entries) {
    if (en.start > cursor)
      lines.push(...src.slice(cursor, en.start).replace(/\r\n/g, "\n").split("\n"));
    lines.push(renderEntry(en));
    cursor = en.end;
  }
  if (cursor < src.length)
    lines.push(...src.slice(cursor).replace(/\r\n/g, "\n").split("\n"));
  // Tidy: strip trailing whitespace per line, collapse blank runs to a single
  // blank line, drop blanks at both ends, keep one trailing newline.
  const tidy: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/g, "");
    if (line === "" && tidy.length > 0 && tidy[tidy.length - 1] === "") continue;
    tidy.push(line);
  }
  while (tidy.length && tidy[0] === "") tidy.shift();
  while (tidy.length && tidy[tidy.length - 1] === "") tidy.pop();
  return tidy.join("\n") + "\n";
}

/** Look up a field by name (case-insensitive). */
export function fieldOf(fields: BibField[], name: string): string | null {
  const f = fields.find((x) => x.name.toLowerCase() === name);
  return f ? f.value : null;
}

/** Strip one pair of outer value delimiters ({…} or "…"). */
export function stripDelims(v: string): string {
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === "{" && b === "}") || (a === '"' && b === '"')) return v.slice(1, -1);
  }
  return v;
}

/** Short author/year hint for a completion row: "Smith et al., 2023". */
export function citationHint(type: string, fields: BibField[]): string {
  const raw = fieldOf(fields, "author") ?? fieldOf(fields, "editor");
  const yearRaw = fieldOf(fields, "year");
  const year = yearRaw ? stripDelims(yearRaw) : null;
  let label = type;
  if (raw) {
    const chunks = stripDelims(raw).split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    if (chunks.length) {
      label = chunks[0];
      if (chunks.length > 1) label += " et al.";
    }
  }
  return year ? `${label}, ${year}` : label;
}