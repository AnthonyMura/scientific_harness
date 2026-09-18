// Verification harness — issue 27 (pdf citation hover, reference data). Run from WSL:
//   ~/nodejs/bin/node --experimental-strip-types workbench/web/verify/pdf-refs.mjs
import { assembleRefMap, orderToNumberMap, parseAux, parseBbl, parseBibtex } from "../src/modules/pdfRefs.ts";

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

// ------------------------------------------------------------- aux: numbered style
// The real natbib numbers-style aux (as produced by plainnat): the second arg
// is nested — {{number}{year}{label-parts}}.
const AUX_NUMBERED = [
  "\\relax ",
  "\\citation{smith2023}",
  "\\bibstyle{plainnat}",
  "\\bibdata{refs}",
  "\\bibcite{doe2020}{{1}{2020}{{Doe}}{{}}}",
  "\\bibcite{lee2019}{{2}{2019}{{Lee}}{{}}}",
  "\\bibcite{mura2024}{{3}{2024}{{Mura}}{{}}}",
  "\\bibcite{smith2023}{{4}{2023}{{Smith and Doe}}{{}}}",
].join("\n");

{
  const p = parseAux(AUX_NUMBERED);
  check("aux: four numbered citations mapped (nested form)", p.numberToKey.size, 4);
  check("aux: 1 -> doe2020", p.numberToKey.get(1), "doe2020");
  check("aux: 4 -> smith2023", p.numberToKey.get(4), "smith2023");
  check("aux: bibdata name extracted", p.bibNames.join(","), "refs");
  check("aux: no bibitem order in a natbib aux", p.bibitemOrder.length, 0);
}

// ------------------------------------------------------------- aux: simple flat form + author-year ignored
{
  const p = parseAux("\\bibcite{alpha}{7}\n\\bibcite{smith2023}{Smith et~al.(2023)}\n\\bibcite{doe2020}{Doe(2020)}");
  check("aux: simple flat numeric form accepted", p.numberToKey.get(7), "alpha");
  check("aux: author-year labels ignored", p.numberToKey.size, 1);
}

// ------------------------------------------------------------- aux: bibitem order fallback
{
  const p = parseAux("\\citation{a,b}\n\\bibitem{alpha}\n\\bibitem{beta}\n\\bibdata{refs.bib}");
  check("aux: bibitem order kept", p.bibitemOrder.join(","), "alpha,beta");
  const n2k = orderToNumberMap(p.bibitemOrder);
  check("aux: 1-based numbering from order", n2k.get(1) + "," + n2k.get(2), "alpha,beta");
  check("aux: .bib extension stripped from bibdata name", p.bibNames.join(","), "refs");
}

// ------------------------------------------------------------- BibTeX parser
const BIB = [
  "% a top-level comment line",
  "@article{smith2023,",
  "  author  = {Smith, John and Doe, Anna},",
  "  title   = {A very long title that wraps onto",
  "             a second line in the references section},",
  "  journal = {Journal of Things},",
  "  volume  = {1},",
  "  pages   = {1--9},",
  "  year    = {2023},",
  "  doi     = {10.5555/jt.2023.001}",
  "}",
  "",
  '@book{doe2020,',
  '  author    = "Doe, Anna",',
  "  title     = {Another Book on the Same Topic},",
  "  publisher = {Press of Things},",
  "  pages     = {1--40},",
  "  year      = {2020}",
  "}",
  "",
  "@article{mura2024,",
  "  author  = {Mura, Anthony},",
  "  title   = {Recent Advances in the Measurement of Effects},",
  "  journal = Journal of Things,",
  "  year    = 2024,",
  "  doi     = 10.5555/jt.2024.002",
  "}",
  "",
  "@string{JTHINGS = {Journal of Things}}",
  "",
  "@comment{this whole entry is a comment block",
  "  spanning lines}",
  "",
  "@inproceedings{lee2019,",
  "  author    = {Lee, Grace},",
  "  title     = {Earlier Work on the Same Ground},",
  "  booktitle = {Proceedings of Things},",
  "  pages     = {100--108},",
  "  year      = {2019}",
  "}",
].join("\n");

{
  const bib = parseBibtex(BIB);
  check("bib: four entries parsed (string/comment dropped)", bib.size, 4);
  const s = bib.get("smith2023");
  check("bib: multi-line title collapsed", s.title, "A very long title that wraps onto a second line in the references section");
  check("bib: 'and' kept in authors", s.author, "Smith, John and Doe, Anna");
  check("bib: braced doi", s.doi, "10.5555/jt.2023.001");
  check("bib: journal + year extracted", s.journal + "/" + s.year, "Journal of Things/2023");
  const d = bib.get("doe2020");
  check("bib: quoted value with comma", d.author, "Doe, Anna");
  check("bib: missing doi stays undefined", d.doi === undefined, true);
  const m = bib.get("mura2024");
  check("bib: bare (unbraced) values accepted", m.journal + "/" + m.year + "/" + m.doi, "Journal of Things/2024/10.5555/jt.2024.002");
  const l = bib.get("lee2019");
  check("bib: inproceedings title", l.title, "Earlier Work on the Same Ground");
}

// ------------------------------------------------------------- bbl parser
const BBL = [
  "\\begin{thebibliography}{10}",
  "",
  "\\bibitem[{Doe(2020)}]{doe2020}",
  "Doe, A. (2020). Another Book on the Same Topic.",
  "Press of Things, pp. 1--40.",
  "",
  "\\bibitem[{Lee(2019)}]{lee2019}",
  "Lee, G. (2019). Earlier Work on the Same Ground.",
  "",
  "\\end{thebibliography}",
].join("\n");

{
  const p = parseBbl(BBL);
  check("bbl: order kept", p.order.join(","), "doe2020,lee2019");
  check(
    "bbl: raw entry text joined across lines",
    p.rawByKey.get("doe2020"),
    "Doe, A. (2020). Another Book on the Same Topic. Press of Things, pp. 1--40.",
  );
  check("bbl: trailing section marker not in entry text", /thebibliography/.test(p.rawByKey.get("lee2019")), false);
}

// ------------------------------------------------------------- end-to-end RefMap (numbered style)
{
  const aux = parseAux(AUX_NUMBERED);
  const bib = parseBibtex(BIB);
  const map = assembleRefMap(aux.numberToKey, bib, null);
  check("e2e: four numbers resolved", map.size, 4);
  const r1 = map.get(1);
  check("e2e: [1] is doe2020 (real aux order)", r1.key, "doe2020");
  check("e2e: [1] no doi stays undefined", r1.doi === undefined, true);
  const r4 = map.get(4);
  check("e2e: [4] title (multi-line collapsed)", r4.title, "A very long title that wraps onto a second line in the references section");
  check("e2e: [4] authors", r4.authors, "Smith, John and Doe, Anna");
  check("e2e: [4] doi", r4.doi, "10.5555/jt.2023.001");

  // bbl fallback: no bib fields, raw text only, numbering from \bibitem order
  const bbl = parseBbl(BBL);
  const map2 = assembleRefMap(orderToNumberMap(bbl.order), null, bbl.rawByKey);
  check("e2e-bbl: [1] is the first \\bibitem", map2.get(1).key, "doe2020");
  check("e2e-bbl: raw text carried", (map2.get(2).raw || "").startsWith("Lee, G. (2019)"), true);

  // no numbering at all -> null (the viewer falls back to the PDF's own text)
  check("e2e: empty numbering resolves to null", assembleRefMap(new Map(), bib, null), null);
}

if (failed) {
  console.error(failed + " check(s) FAILED");
  process.exit(1);
}
console.log("ALL PDF-REFS CHECKS PASSED");
