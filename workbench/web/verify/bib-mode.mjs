// Verification harness — issue 26 (BibTeX colour palette): runs the real
// bibLanguage stream mode and asserts which token each piece of source gets.
// Run from WSL:
//   cd workbench/web && ~/nodejs/bin/node --experimental-strip-types --import ./verify/ts-hooks.mjs verify/bib-mode.mjs
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { bibLanguage } from "../src/bibMode.ts";

const SAMPLE = [
  "% a comment line",
  "@article{smith2023,",
  "  author = {Smith, John and Doe, Anna},",
  '  title = "A quoted {title}",',
  "  year = {2023}",
  "}",
  "@string{jan = {January}}",
].join("\n");

const state = EditorState.create({ doc: SAMPLE, extensions: [bibLanguage] });
const tree = syntaxTree(state);

/** Leaf nodes (tokens): every non-empty span that contains no other span.
 *  Note: lezer 1.5 iterate() passes one shared TreeCursor — capture the real
 *  node via cursor.node() inside the callback, never after iteration. */
function collectLeaves(t) {
  const all = [];
  t.iterate({ enter(c) { if (c.from < c.to) all.push({ name: c.name, from: c.from, to: c.to }); } });
  return all.filter((n) => !all.some((m) => m !== n && m.from >= n.from && m.to <= n.to));
}

const leaves = collectLeaves(tree);

/** Token name covering the first char of `needle` in the sample. */
function tokenOf(needle) {
  const at = SAMPLE.indexOf(needle);
  if (at < 0) throw new Error("needle not found: " + needle);
  const leaf = leaves.find((l) => l.from <= at && at < l.to);
  return leaf ? leaf.name : "<none>";
}

let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) console.log("ok   " + name + " -> " + actual);
  else {
    failed++;
    console.error("FAIL " + name + ": got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
  }
}

check("% comment", tokenOf("% a comment"), "comment");
check("@article entry type (structural)", tokenOf("@article"), "keyword.special");
check("entry key (citation atom)", tokenOf("smith2023"), "citation");
check("field name", tokenOf("author"), "keyword");
check("braces are brackets", tokenOf("{Smith"), "bracket");
check("@string (non-standard) is a plain keyword", tokenOf("@string"), "keyword");

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL BIB-MODE CHECKS PASSED");