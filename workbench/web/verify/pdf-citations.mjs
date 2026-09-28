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

// ------------------------------------------------------------- MDPI-style bare labels
{
  // "N." entry labels (MDPI/ACS print style): detection, number→line mapping,
  // continuation lines (incl. a DOI wrapped to a line start), and rejection of
  // a wrong-numbered prose line with recovery on the next real label.
  const pages = [
    [
      L("Body text before the heading.", 72, 100, 300),
      L("References", 250, 400, 350),
      L("1. Smith A, Doe B. First title here.", 72, 420, 500),
      L("Journal of Things, 2023, 1, 1-9.", 80, 436, 300),
      L("2. Kim C. Second title with a", 72, 452, 500),
      L("DOI 10.1016/S0140-6736(20)32667-2.", 80, 468, 300), // no space after the dot: not a label
      L("5. Fake prose line in the section.", 80, 484, 300), // wrong number: continuation of 2
      L("3. Park D. Third title.", 72, 500, 500),
    ],
    [
      L("4. Right column start ignored", 320, 100, 580), // two-column guard
      L("4. Lee E. Fourth title on page two.", 72, 120, 500),
    ],
  ];
  const bib = scanBibliography(pages);
  check("mdpi: entry count", bib.size, 4);
  check("mdpi: 1 page + yTop", String(bib.get(1).page) + "," + String(bib.get(1).yTopPx), "1,420");
  check("mdpi: 1 keeps its continuation line", bib.get(1).lines.length, 2);
  check("mdpi: 2 absorbs DOI + fake lines", bib.get(2).lines.length, 3);
  check("mdpi: 3 page + yTop", String(bib.get(3).page) + "," + String(bib.get(3).yTopPx), "1,500");
  check("mdpi: 4 on page 2", String(bib.get(4).page) + "," + String(bib.get(4).yTopPx), "2,120");
  check("mdpi: no spurious 5", bib.has(5), false);

  // First bare label must be "1." (sequence starts at the heading), and a
  // decimal at a line start is not a label.
  const n = scanBibliography([
    [
      L("References", 250, 400, 350),
      L("3. The results show a trend.", 72, 420, 300), // not first: rejected
      L("0.5 mg was administered next.", 72, 436, 300), // decimal: no space after the dot
      L("1. Smith A. Real first entry.", 72, 452, 300),
    ],
  ]);
  check("mdpi: first label must be 1", n.size, 1);
  check("mdpi: only the real entry indexed", n.has(1) && !n.has(3), true);
  check("mdpi: rejected lines dropped (no open entry)", n.get(1).lines.length, 1);
}

// ------------------------------------------------------------- label-style lock
{
  // A bracketed bibliography never treats a bare "N." as an entry…
  const b = scanBibliography([
    [
      L("References", 250, 400, 350),
      L("[1] Smith A. Title one.", 72, 420, 300),
      L("2. Wrapped prose after entry one.", 80, 436, 300),
      L("[2] Doe B. Title two.", 72, 452, 300),
    ],
  ]);
  check("style lock: bracketed doc ignores bare labels", b.size, 2);
  check(
    "style lock: no spurious entry, prose kept as continuation",
    b.get(1).lines.length === 2 && !b.has(3),
    true,
  );

  // …and an MDPI bibliography never treats a wrapped "[N]" at a line start
  // as an entry (the real "2." must still win its number).
  const m = scanBibliography([
    [
      L("References", 250, 400, 350),
      L("1. Smith A. Title one.", 72, 420, 300),
      L("[2] Wrapped bracket in entry text.", 80, 436, 300),
      L("2. Doe B. Title two.", 72, 452, 300),
    ],
  ]);
  check("style lock: bare doc ignores bracketed labels", m.size, 2);
  check("style lock: real bare entry 2 keeps its line", String(m.get(2).yTopPx), "452");
}

// ------------------------------------------------------------- heading-less fallback
{
  // MDPI submission builds render the references section WITHOUT a visible
  // "References" heading (mdpi.cls emits an empty \section when \@reftitle is
  // unset). The section must then be located from the bare "1." label itself:
  // short numbered lines (section titles like "2. Materials and Methods") are
  // rejected, a long prose list item that happens to start with "1." loses to
  // the later real bibliography (last passing candidate wins), and the entry
  // index must come out exactly as if a heading had been present.
  const pages = [
    [
      L("1. Introduction", 72, 100, 300), // short section title: not a candidate
      L("Sperm samples were collected and imaged.", 72, 116, 400),
      L("2. Materials and Methods", 72, 132, 300), // short: not a candidate
      L("1. Prepare the sample as described in [5]. This step takes about an hour.", 72, 148, 540), // long prose "1." — passes validation but must lose to the real bib
      L("Samples were then imaged at 63x magnification.", 72, 164, 400),
    ],
    [
      L("1. Cox C.M.; Thoma M.E.; Tchangalova N. Infertility prevalence and the methods of estimation from 1990 to 2021.", 72, 100, 560), // real bib start (last passing candidate)
      L("Human Reproduction Open 2022, 2022, hoac051. https://doi.org/10.1093/hropen/hoac051.", 80, 116, 480), // continuation
      L("2. Sun H.; Gong T.T.; Jiang Y.T. Global, regional, and national prevalence of infertility.", 72, 132, 560),
      L("3. Park D.; Lee E. Third title with authors and a long enough line to count.", 72, 148, 560),
      L("4. Kim C.; Doe B. Fourth entry on this page.", 72, 164, 560),
      L("5. Smith A. Fifth entry.", 72, 180, 560),
    ],
    [
      L("6. Hinz B.; Lagares D. Sixth entry continues the list.", 72, 100, 560),
      L("7. Workentine M.L.; et al. Seventh entry for validation depth.", 72, 116, 560),
      L("8. Hinz B. Eighth and final entry of the synthetic bibliography.", 72, 132, 560),
    ],
  ];
  const bib = scanBibliography(pages);
  check("fallback: entry count", bib.size, 8);
  check("fallback: starts at the real bib, not the prose list", bib.get(1).lines[0].startsWith("1. Cox"), true);
  check("fallback: 1 page + yTop", String(bib.get(1).page) + "," + String(bib.get(1).yTopPx), "2,100");
  check("fallback: 1 keeps its continuation line", bib.get(1).lines.length, 2);
  check("fallback: 8 on page 3", String(bib.get(8).page) + "," + String(bib.get(8).yTopPx), "3,132");

  // A document with short numbered lines only (sections, no bibliography) must
  // stay inert — the fallback never fires.
  const n = scanBibliography([
    [
      L("1. Introduction", 72, 100, 300),
      L("Body text under the introduction.", 72, 116, 400),
      L("2. Materials and Methods", 72, 132, 300),
      L("More body text.", 72, 148, 300),
    ],
  ]);
  check("fallback: short numbered lines only -> empty", n.size, 0);

  // …and a bare sequence shorter than the validation threshold (7 < 8) is not
  // accepted as a bibliography either.
  const s = scanBibliography([
    [
      L("1. Author A. First short-ish reference line that is long enough.", 72, 100, 500),
      L("2. Author B. Second short-ish reference line that is long enough.", 72, 116, 500),
      L("3. Author C. Third short-ish reference line that is long enough.", 72, 132, 500),
      L("4. Author D. Fourth short-ish reference line that is long enough.", 72, 148, 500),
      L("5. Author E. Fifth short-ish reference line that is long enough.", 72, 164, 500),
      L("6. Author F. Sixth short-ish reference line that is long enough.", 72, 180, 500),
      L("7. Author G. Seventh short-ish reference line that is long enough.", 72, 196, 500),
    ],
  ]);
  check("fallback: sequence under threshold -> empty", s.size, 0);

  // An explicit heading still wins over the fallback when both are present.
  const h = scanBibliography([
    [
      L("1. Introduction", 72, 100, 300),
      L("References", 250, 400, 350),
      L("1. Smith A. Heading-wins entry one.", 72, 420, 400),
      L("2. Doe B. Heading-wins entry two.", 72, 436, 400),
    ],
  ]);
  check("fallback: explicit heading wins", h.size === 2 && h.get(1).yTopPx === 420, true);
}

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL PDF-CITATION CHECKS PASSED");
