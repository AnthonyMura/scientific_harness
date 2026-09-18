// Verification harness — issue 26 (pdf citation jump). Run from WSL:
//   ~/nodejs/bin/node --experimental-strip-types workbench/web/verify/pdf-citations.mjs
import { bibStartLines, scanPage, scanBibliography } from "../src/modules/pdfCitations.ts";

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

// Fake span: a page-local box (page origin at 0,0) with text.
function span(text, x, y, w, h) {
  return {
    textContent: text,
    getBoundingClientRect: () => ({ left: x, top: y, right: x + w, bottom: y + h }),
  };
}

// Scan a synthetic page; records the groups the marker factory would render.
function scan(textDivs, scale = "") {
  const page = {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 612, bottom: 792 }),
    appendChild: () => {}, // recording happens in the marker factory below
    style: { getPropertyValue: () => scale },
    markers: [],
  };
  const out = scanPage(page, { textDivs }, (g) => {
    page.markers.push({ cite: g.numbers.join(","), box: g.box });
    return {};
  });
  return Object.assign({}, out, { markers: page.markers });
}

const H = 14; // glyph box height for the synthetic lines

// ------------------------------------------------------------- [1] basics
{
  const r = scan([
    span("The result ", 72, 100, 80, H),
    span("[", 152, 100, 6, H),
    span("1", 158, 100, 6, H),
    span("]", 164, 100, 6, H),
    span(" shows", 170, 100, 40, H),
  ]);
  check("[1]: one group", r.groups.length, 1);
  check("[1]: numbers", r.groups[0].numbers.join(","), "1");
  check("[1]: box x extent", r.groups[0].box.x0 + "," + r.groups[0].box.x1, "152,170");
  check("[1]: one marker", r.markers.length, 1);
  check("[1]: marker data-cite", r.markers[0].cite, "1");
}

// ------------------------------------------------------------- [2,3] comma group
{
  const r = scan([
    span("See ", 72, 100, 30, H),
    span("[", 102, 100, 6, H),
    span("2", 108, 100, 6, H),
    span(",", 114, 100, 5, H),
    span("3", 119, 100, 6, H),
    span("]", 125, 100, 6, H),
  ]);
  check("[2,3]: one group", r.groups.length, 1);
  check("[2,3]: numbers", r.groups[0].numbers.join(","), "2,3");
  check("[2,3]: two subBoxes", r.groups[0].subBoxes.length, 2);
  const [s0, s1] = r.groups[0].subBoxes;
  check("[2,3]: subBox order + coverage", s0.x0 + "," + s1.x1, "108,125");
}

// ------------------------------------------------------------- ranges, all dashes
{
  const en = scan([span("x [4–6] y", 72, 100, 90, H)]);
  check("[4–6] en dash: numbers", en.groups[0].numbers.join(","), "4,5,6");
  const em = scan([span("x [7—9] y", 72, 100, 90, H)]);
  check("[7—9] em dash: numbers", em.groups[0].numbers.join(","), "7,8,9");
  const hy = scan([span("x [10-12] y", 72, 100, 90, H)]);
  check("[10-12] hyphen: numbers", hy.groups[0].numbers.join(","), "10,11,12");
  const mixed = scan([span("x [2, 4–6] y", 72, 100, 110, H)]);
  check("[2, 4–6] mixed: numbers", mixed.groups[0].numbers.join(","), "2,4,5,6");
}

// ------------------------------------------------------------- wrapped group
{
  const r = scan([
    span("see [2,", 72, 100, 60, H), // line 1 ends inside the group
    span("3] and more", 72, 125, 90, H), // line 2 (gap 25 > tol) starts with the rest
  ]);
  check("wrapped [2, / 3]: no group", r.groups.length, 0);
}

// ------------------------------------------------------------- non-citations
{
  const a = scan([span("[1a]", 72, 100, 40, H)]);
  check("[1a]: not a citation", a.groups.length, 0);
  const y = scan([span("Smith (2023) showed", 72, 100, 160, H)]);
  check("(2023): not a citation", y.groups.length, 0);
  const e = scan([span("[] and [1 2]", 72, 100, 90, H)]);
  check("[] / [1 2]: not citations", e.groups.length, 0);
}

// ------------------------------------------------------------- line grouping
{
  // Subscript (center offset ~3px) stays on its line; a real second line splits.
  const r = scan([
    span("The result", 72, 100, 80, H),
    span("a", 152, 105, 6, 10), // subscript
    span("Next line text.", 72, 125, 90, H),
  ]);
  check("subscript stays on its line: two lines", r.lines.length, 2);
  check("line 1 includes subscript", r.lines[0].text, "The resulta");

  // At 3x zoom the tolerance scales: a 16px center offset is still one line.
  const z = scan(
    [
      span("The result", 72, 100, 80, H),
      span("a", 152, 118, 6, 10), // subscript at high zoom
      span("Next line text.", 72, 150, 90, H),
    ],
    "3",
  );
  check("zoom 3x: subscript stays on its line", z.lines.length, 2);

  // A group spanning a column boundary (huge internal gap) is rejected.
  const c = scan([span("[", 72, 100, 6, H), span("1", 400, 100, 6, H), span("]", 406, 100, 6, H)]);
  check("column-gap group rejected", c.groups.length, 0);
}

// ------------------------------------------------------------- bibliography
const L = (text, x0, yTop, x1) => ({ text, x0, yTop, x1 });
{
  const pages = [
    [
      L("Body paragraph one.", 72, 100, 300),
      L("References", 250, 400, 350),
      L("[1] Smith, John et al. (2023). A title.", 72, 420, 500),
      L("Journal of Things, 1, 1-9.", 80, 436, 300),
    ],
    [
      L("[2] Doe, Anna. (2020). Another book.", 72, 100, 400),
      L("Press of Things, pp. 1-40.", 80, 116, 300),
      L("[5] Right column start ignored", 320, 100, 580),
    ],
  ];
  const bib = scanBibliography(pages);
  check("bib: entry count", bib.size, 2);
  check("bib: [1] page", String(bib.get(1).page), "1");
  check("bib: [1] yTop", String(bib.get(1).yTopPx), "420");
  check("bib: [1] x extent", bib.get(1).xPx + "," + bib.get(1).x1Px, "72,500");
  check("bib: [1] line height from next-line gap", String(bib.get(1).lineHpx), "16");
  check("bib: [1] includes continuation line", bib.get(1).lines.length, 2);
  check("bib: [2] on page 2", String(bib.get(2).page), "2");
  check("bib: right-column [5] ignored", bib.has(5), false);

  const b = scanBibliography([[L("Bibliography", 250, 400, 350), L("[7] Kim. (2023). Z.", 72, 420, 300)]]);
  check("bib: 'Bibliography' heading accepted", b.has(7), true);

  const n = scanBibliography([[L("Body only, no heading.", 72, 100, 300), L("[1] X. (2020). Y.", 72, 120, 300)]]);
  check("bib: no heading -> empty", n.size, 0);
}

// ------------------------------------------------------------- bibStartLines
{
  const pages = [
    [L("Body line one.", 72, 100, 300), L("References", 72, 400, 300), L("[1] A. (2020). B.", 72, 420, 300)],
    [L("[2] C. (2021). D.", 72, 100, 300)],
  ];
  const starts = bibStartLines(pages);
  check("bibStart: heading page index + later pages", starts.join(","), "1,0");

  check(
    "bibStart: no heading -> all -1",
    bibStartLines([[L("Body only.", 72, 100, 300)]]).join(","),
    "-1",
  );
}

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL PDF-CITATION CHECKS PASSED");
