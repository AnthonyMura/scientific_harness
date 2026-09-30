// Starter suite for the BibTeX pretty-printer (bibFormat.ts) — pure string
// logic, node environment, no DOM. Run: npm test (vitest run).
import { describe, expect, it } from "vitest";
import { citationHint, fieldOf, formatBib, scanBibEntries, stripDelims } from "./bibFormat";

const BIB = [
  "@article{smith2023deep,",
  "  author = {Alice Smith and Bob Jones},",
  "  title = {Deep   Learning for Scientific Writing},",
  "  year = {2023},",
  "}",
  "",
  "% a comment between entries",
  "@book{knuth1984,",
  "  author = {Donald Knuth},",
  "  title = {The TeXbook},",
  "  year = {1984},",
  "}",
].join("\n");

describe("scanBibEntries", () => {
  it("finds keyed entries in order with parsed fields", () => {
    const entries = scanBibEntries(BIB);
    expect(entries.map((e) => e.key)).toEqual(["smith2023deep", "knuth1984"]);
    const first = entries[0];
    expect(first.type).toBe("article");
    expect(fieldOf(first.fields, "title")).toBe("{Deep Learning for Scientific Writing}");
  });

  it("ignores @-signs that are not entry headers", () => {
    expect(scanBibEntries("no entries here @not-a-entry either")).toEqual([]);
  });
});

describe("formatBib", () => {
  it("re-emits canonically: one field per line, whitespace collapsed", () => {
    // Note the blank line after the comment: formatBib keeps the gap text
    // around non-entry lines verbatim (only collapsing runs of blanks).
    expect(formatBib(BIB)).toBe(
      [
        "@article{smith2023deep,",
        "  author = {Alice Smith and Bob Jones},",
        "  title = {Deep Learning for Scientific Writing},",
        "  year = {2023}",
        "}",
        "",
        "% a comment between entries",
        "",
        "@book{knuth1984,",
        "  author = {Donald Knuth},",
        "  title = {The TeXbook},",
        "  year = {1984}",
        "}",
      ].join("\n") + "\n",
    );
  });

  it("is idempotent", () => {
    const once = formatBib(BIB);
    expect(formatBib(once)).toBe(once);
  });

  it("leaves non-entry text untouched", () => {
    expect(formatBib("just prose")).toBe("just prose");
  });
});

describe("citationHint / stripDelims", () => {
  it("builds 'First et al., year' hints from author+year fields", () => {
    const first = scanBibEntries(BIB)[0];
    expect(citationHint(first.type, first.fields)).toBe("Alice Smith et al., 2023");
  });

  it("strips one pair of outer delimiters only", () => {
    expect(stripDelims("{a and b}")).toBe("a and b");
    expect(stripDelims('"quoted"')).toBe("quoted");
    expect(stripDelims("{nested}x")).toBe("{nested}x");
  });
});
