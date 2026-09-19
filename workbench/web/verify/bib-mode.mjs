// Verification harness — issue 26 (BibTeX colour palette): runs the real
// bibLanguage stream mode and asserts which token each piece of source gets.
// Run from WSL:
//   cd workbench/web && ~/nodejs/bin/node --experimental-strip-types --import ./verify/ts-hooks.mjs verify/bib-mode.mjs
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { bibLanguage } from "../src/bibMode.ts";

let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) console.log("ok   " + name + " -> " + actual);
  else {
    failed++;
    console.error("FAIL " + name + ": got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
  }
}

/** Leaf nodes (tokens): every non-empty span that contains no other span.
 *  Note: lezer 1.5 iterate() passes one shared TreeCursor — capture the real
 *  node via cursor.node() inside the callback, never after iteration. */
function analyze(sample) {
  const state = EditorState.create({ doc: sample, extensions: [bibLanguage] });
  const tree = syntaxTree(state);
  const all = [];
  tree.iterate({ enter(c) { if (c.from < c.to) all.push({ name: c.name, from: c.from, to: c.to }); } });
  const leaves = all.filter((n) => !all.some((m) => m !== n && m.from >= n.from && m.to <= n.to));
  /** Token name covering the first char of `needle` in the sample. */
  function tokenOf(needle) {
    const at = sample.indexOf(needle);
    if (at < 0) throw new Error("needle not found: " + needle);
    const leaf = leaves.find((l) => l.from <= at && at < l.to);
    return leaf ? leaf.name : "<none>";
  }
  return { tokenOf };
}

// --- basic palette (issue 26) -------------------------------------------
const SAMPLE = [
  "% a comment line",
  "@article{smith2023,",
  "  author = {Smith, John and Doe, Anna},",
  '  title = "A quoted {title}",',
  "  year = {2023}",
  "}",
  "@string{jan = {January}}",
].join("\n");
const basic = analyze(SAMPLE);

check("% comment", basic.tokenOf("% a comment"), "comment");
check("@article entry type (structural)", basic.tokenOf("@article"), "keyword.special");
check("entry key (citation atom)", basic.tokenOf("smith2023"), "citation");
check("field name", basic.tokenOf("author"), "keyword");
check("braces are brackets", basic.tokenOf("{Smith"), "bracket");
check("@string (non-standard) is a plain keyword", basic.tokenOf("@string"), "keyword");

// --- % inside a multi-line braced value must NOT start a comment ---------
// (Zotero abstracts are full of "95\% confidence interval"; commenting to EOL
// used to swallow the value's closing brace and desync depth tracking, so no
// entry after it was ever highlighted again — 2026-09-19.)
const DESYNC_SAMPLE = [
  "@article{first,",
  "  title = {Multi % line value",
  "  still in value},",
  "  year = {2023}",
  "}",
  "@article{second,",
  "  author = {A, B},",
  "}",
  "% real top-level comment",
].join("\n");
const desync = analyze(DESYNC_SAMPLE);

check("% inside multi-line value is prose, not a comment", desync.tokenOf("% line value"), "<none>");
check("continuation line of the value is prose", desync.tokenOf("still in value"), "<none>");
check("field after multi-line value still tagged", desync.tokenOf("year = {2023}"), "keyword");
check("next entry key still a citation", desync.tokenOf("second"), "citation");
check("top-level % comment still works", desync.tokenOf("% real top-level"), "comment");

// --- recovery: an @ header where a field is expected (forced desync) -----
const RECOVERY_SAMPLE = [
  "@article{broken,",
  "  note = {unbalanced brace never closed",
  "}",
  "@article{recovered,",
  "  author = {X},",
  "}",
].join("\n");
const recovery = analyze(RECOVERY_SAMPLE);

check("entry after desync: @type tagged again", recovery.tokenOf("@article{recovered"), "keyword.special");
check("entry after desync: key tagged again", recovery.tokenOf("recovered,"), "citation");
check("entry after desync: field tagged again", recovery.tokenOf("author = {X}"), "keyword");

// --- multi-line quoted value ---------------------------------------------
const QUOTE_SAMPLE = [
  "@article{q,",
  '  note = "abc',
  '  year = {2023}",',
  "  real = {x},",
  "}",
].join("\n");
const quote = analyze(QUOTE_SAMPLE);

check("line inside multi-line quoted value is prose (not a field)", quote.tokenOf("year = {2023}\","), "<none>");
check("field after quoted value closes still tagged", quote.tokenOf("real"), "keyword");

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL BIB-MODE CHECKS PASSED");