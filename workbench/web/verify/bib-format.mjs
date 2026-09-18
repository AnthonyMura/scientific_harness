// Verification harness — issue 26 (BibTeX Format action, same logic as JSON
// formatting). Run from WSL:
//   ~/nodejs/bin/node --experimental-strip-types workbench/web/verify/bib-format.mjs
import { formatBib, scanBibEntries, citationHint } from "../src/bibFormat.ts";

let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    console.log("ok   " + name);
  } else {
    failed++;
    console.error("FAIL " + name);
    console.error("--- expected ---\n" + expected);
    console.error("--- actual ---\n" + actual);
  }
}

const MESSY = [
  "% References for the paper",
  "",
  "@article{smith2023,",
  "author = {Smith, John and Doe, Anna}, title = {A  very   long",
  "title with  spaces}, year={2023},",
  "journal = {J. of Things}}",
  "",
  "",
  "@book{doe2020,",
  '  editor = "Doe, Anna",',
  "  title = {Braced {Nested} Value},",
  "  year = 2020",
  "}",
  "",
  "@string{jan = {January}}",
  "",
  "@comment{keep   this   free text, as-is}",
  "",
  "@software{tool99, note = {hello world}, version = {1.0}}",
].join("\n");

const EXPECTED = [
  "% References for the paper",
  "",
  "@article{smith2023,",
  "  author = {Smith, John and Doe, Anna},",
  "  title = {A very long title with spaces},",
  "  year = {2023},",
  "  journal = {J. of Things}",
  "}",
  "",
  "@book{doe2020,",
  '  editor = "Doe, Anna",',
  "  title = {Braced {Nested} Value},",
  "  year = 2020",
  "}",
  "",
  "@string{jan = {January}}",
  "",
  "@comment{keep   this   free text, as-is}",
  "",
  "@software{tool99,",
  "  note = {hello world},",
  "  version = {1.0}",
  "}",
].join("\n") + "\n";

check("messy sample -> canonical layout", formatBib(MESSY), EXPECTED);
check("idempotent (format(format(x)) == format(x))", formatBib(formatBib(MESSY)), EXPECTED);
check("no entries -> untouched", formatBib("just some text\n"), "just some text\n");

// ---------------------------------------------------------------- scanner
const entries = scanBibEntries(MESSY);
check("entry count", String(entries.length), "5");
const art = entries.find((e) => e.key === "smith2023");
check("article type", art.type, "article");
check("article field names", art.fields.map((f) => f.name).join(","), "author,title,year,journal");
check("multi-line value collapsed", art.fields[1].value, "{A very long title with spaces}");
const book = entries.find((e) => e.key === "doe2020");
check("quoted value kept quoted", book.fields[0].value, '"Doe, Anna"');
check("nested braces intact", book.fields[1].value, "{Braced {Nested} Value}");
const sw = entries.find((e) => e.key === "tool99");
check("custom standard type keyed", sw.type, "software");

// ---------------------------------------------------------------- hints
const hintFields = art.fields;
check("hint multi-author + year", citationHint("article", hintFields), "Smith, John et al., 2023");
check("hint single author", citationHint("book", [{ name: "author", value: "{Mura, Anthony}" }, { name: "year", value: "2024" }]), "Mura, Anthony, 2024");
check("hint no author falls back to type", citationHint("misc", [{ name: "note", value: "{n}" }]), "misc");

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL BIB-FORMAT CHECKS PASSED");