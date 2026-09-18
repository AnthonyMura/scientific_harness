// PDF module: reads any project PDF in a single pane. Two modes —
// "compiled output" (the main file's PDF from LaTeX, with SyncTeX, Save
// version and Save As) and a static file opened from the Explorer (read-only,
// no sync). The compile controls live in the editor pane header while a .tex
// file is open; project settings (main file, target) live in the top bar.
// Zoom is a module setting adjustable from the header. Pages keep their
// natural size and the host scrolls in both directions; a transparent text
// layer over each canvas makes the text selectable. SyncTeX (M3): a click in
// the editor scrolls here to the matching line (forward search), and a click
// on a page jumps back to the source line (inverse search).
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { forwardLookup, parseSynctex, reverseLookup } from "../modules/synctex";
import type { SynctexData } from "../modules/synctex";
import { CITE_MARKER_PAD, bibStartLines, scanBibliography, scanPage } from "../modules/pdfCitations";
import type { BibEntry, Box, CiteGroup, LineItem } from "../modules/pdfCitations";
import { loadCompiledRefs } from "../modules/pdfRefs";
import type { RefMap } from "../modules/pdfRefs";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { GearIcon } from "../icons";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_SETTINGS: SettingControl[] = [
  { kind: "number", key: "zoom", label: "Zoom", min: 50, max: 300, step: 25, unit: "%" },
];
export const PDF_DEFAULTS: ModuleSettings = { zoom: 125 };

interface Props {
  ctx: AppCtx;
}

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/** One-shot sand flash over a page-local box (citation jump + back pill). */
function flashBoxIn(pageEl: HTMLElement, box: Box) {
  const flash = document.createElement("div");
  flash.className = "pdf-sync-flash";
  flash.style.left = `${box.x0}px`;
  flash.style.top = `${box.y0}px`;
  flash.style.width = `${Math.max(8, box.x1 - box.x0)}px`;
  flash.style.height = `${Math.max(8, box.y1 - box.y0)}px`;
  pageEl.appendChild(flash);
  window.setTimeout(() => flash.remove(), 1700);
}

export default function PdfViewer({ ctx }: Props) {
  const [settings, setSetting] = useModuleSettings("pdf", PDF_DEFAULTS);
  const zoom = typeof settings.zoom === "number" ? settings.zoom : 125;
  /** null → compiled main.pdf output; otherwise a static project file. */
  const pdfFile = ctx.pdfFile;
  // Compile ticks only matter for the compiled-output view; a static file is
  // immutable from the app's point of view.
  const outputTick = pdfFile ? 0 : ctx.pdfVersion;
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const synctexRef = useRef<SynctexData | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [status, setStatus] = useState<string>("");
  const [synctexTick, setSynctexTick] = useState(0);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);
  // Save version / Save As (v3): compiled PDFs are saved into the project as
  // meaningful versions - this pane is the development process's output sink.
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsPath, setSaveAsPath] = useState("");
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // pdfVersion when the static file was opened — a newer compile gets a chip.
  const versionAtOpenRef = useRef<number | null>(null);
  // Citation jump (issue 26): results of the post-render scan — citation
  // groups per page, visual lines per page, and the bibliography index. All
  // boxes are page-local CSS px at the current zoom; rebuilt every render pass.
  const citeIndexRef = useRef<{ page: number; group: CiteGroup }[]>([]);
  const pageLinesRef = useRef<LineItem[][]>([]);
  const bibIndexRef = useRef<Map<number, BibEntry>>(new Map());
  // Citation hover tooltip (issue 27): reference data for what is on screen —
  // structured (aux/bib) when readable, otherwise the raw entry text from the
  // PDF's own References section. Rebuilt at the end of each render pass; a
  // successful compiled-refs load overwrites it with structured data.
  const refsRef = useRef<RefMap | null>(null);
  // Last successful compiled-refs load, keyed by (stem, version) so a slow
  // response from an earlier compile never applies to a newer one.
  const refsCacheRef = useRef<{ key: string; map: RefMap } | null>(null);
  // The tooltip's hide(), exposed to the click and render effects.
  const tipHideRef = useRef<(() => void) | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  // Where the user clicked a citation — the back pill returns here.
  const [backTarget, setBackTarget] = useState<{ page: number; box: Box; label: string; left: number } | null>(null);

  // Mode switch: drop any stale SyncTeX map (re-fetched in compiled-output
  // mode) and remember which compile produced what we are looking at.
  useEffect(() => {
    if (pdfFile) {
      versionAtOpenRef.current = ctx.pdfVersion;
    } else {
      versionAtOpenRef.current = null;
    }
    synctexRef.current = null;
    setSynctexTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile, ctx.projectRoot]);

  // SyncTeX map for the compiled output (M3). Static files have no sync map.
  useEffect(() => {
    if (!ctx.projectOpen || pdfFile) return;
    let cancelled = false;
    (async () => {
      try {
        const text = await api.fetchSynctex(ctx.pdfArtifact?.synctex ?? "main.synctex.gz");
        if (cancelled || !text) return;
        synctexRef.current = parseSynctex(text, ctx.projectRoot);
        setSynctexTick((t) => t + 1);
      } catch {
        // no synctex artifact yet — forward/inverse search stays off silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx.projectOpen, ctx.projectRoot, ctx.pdfVersion, ctx.pdfArtifact, pdfFile]);

  useEffect(() => {
    if (!ctx.projectOpen || !hostRef.current) return;
    let cancelled = false;
    const textLayers: pdfjsLib.TextLayer[] = [];
    (async () => {
      try {
        // Compiled output comes from the artifact endpoint; anything else is a
        // raw project file (the PDF library).
        const artifact = ctx.pdfArtifact?.pdf ?? "main.pdf";
        const blob = pdfFile ? await api.fetchRawFile(pdfFile) : await api.fetchPdf(artifact);
        if (cancelled) return;
        if (!blob) throw new Error(`could not read ${pdfFile}`);
        const data = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        if (docRef.current) void docRef.current.destroy();
        docRef.current = doc;
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = ""; // also clears the citation markers of the last pass
        // A new render pass rebuilds the citation index and clears the back pill.
        citeIndexRef.current = [];
        pageLinesRef.current = [];
        bibIndexRef.current = new Map();
        setBackTarget(null);
        refsRef.current = null; // no stale tooltip data across re-renders
        tipHideRef.current?.();
        setStatus(`rendering ${doc.numPages} page(s)…`);
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: zoom / 100 });
          // Page wrapper: exactly canvas-sized (width: max-content), centered
          // when narrow, scrollable in both directions when wide or tall.
          const pageDiv = document.createElement("div");
          pageDiv.className = "pdf-page";
          // pdf.js TextLayer sizes itself and its fonts via this variable.
          pageDiv.style.setProperty("--scale-factor", String(viewport.scale));
          host.appendChild(pageDiv);
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          pageDiv.appendChild(canvas);
          // Vesper: the pearl page is the brightest surface in the app —
          // pdf.js fills the canvas with white by default, so pass the pearl background.
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport, background: "#F2F1ED" }).promise;
          if (cancelled) break;
          // Transparent selectable text layer over the rendered canvas.
          const textDiv = document.createElement("div");
          textDiv.className = "text-layer";
          pageDiv.appendChild(textDiv);
          const layer = new pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textDiv,
            viewport,
          });
          textLayers.push(layer);
          await layer.render().catch(() => {}); // rejects on cancel — fine
          if (cancelled) break;
          // Citation scan (issue 26): read the laid-out text spans, group them
          // into visual lines, and drop a marker over each [...] group.
          const scanned = scanPage(pageDiv, layer);
          for (const g of scanned.groups) citeIndexRef.current.push({ page: i, group: g });
          pageLinesRef.current.push(scanned.lines);
        }
        if (!cancelled) {
          // The whole document is in — build the bibliography index (issue 26),
          // then unmark the entry labels: a [N] starting a reference line is an
          // entry, not a citation.
          const pages = pageLinesRef.current;
          bibIndexRef.current = scanBibliography(pages);
          const starts = bibStartLines(pages);
          const headingPage = starts.findIndex((s) => s >= 0);
          if (headingPage >= 0) {
            citeIndexRef.current = citeIndexRef.current.filter((c) => {
              if (c.page < headingPage + 1) return true;
              const startY =
                c.page === headingPage + 1 ? pages[c.page - 1][starts[c.page - 1]].yTop : -Infinity;
              return c.group.box.y0 < startY;
            });
            const hostEl = hostRef.current;
            if (hostEl) {
              for (let pi = headingPage; pi < pages.length; pi++) {
                const pageEl = hostEl.children[pi] as HTMLElement | undefined;
                if (!pageEl) continue;
                const startY = pi === headingPage ? pages[pi][starts[pi]].yTop : -Infinity;
                for (const m of Array.from(pageEl.querySelectorAll(".pdf-cite")) as HTMLElement[]) {
                  // makeCiteMarker pads the box by CITE_MARKER_PAD on every side.
                  if (parseFloat(m.style.top) + CITE_MARKER_PAD < startY) continue;
                  m.remove();
                }
              }
            }
          }
          // Tooltip fallback data (issue 27): the entry text as printed in the
          // PDF's own References section — used in static mode and whenever the
          // aux/bib read comes up empty. A structured load for this exact key
          // overwrites it if it already landed (either completion order is
          // fine: the fetch checks cancellation, the pass re-applies the cache).
          const rawRefs: RefMap = new Map();
          for (const [n, entry] of bibIndexRef.current) rawRefs.set(n, { raw: entry.lines.join(" ") });
          refsRef.current = rawRefs;
          const key = pdfFile ? `static@${pdfFile}` : `${(ctx.pdfArtifact?.pdf ?? "main.pdf").replace(/\.pdf$/, "")}@${outputTick}`;
          if (refsCacheRef.current?.key === key) refsRef.current = refsCacheRef.current.map;
          setStatus("");
        }
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      for (const l of textLayers) l.cancel();
    };
  }, [ctx.projectOpen, ctx.projectRoot, outputTick, zoom, pdfFile, ctx.pdfArtifact]);

  // Compiled reference data for the tooltip (issue 27): once per (version,
  // stem). Static files have no aux/bib to read — their data is the raw entry
  // text built by the render pass. Failures degrade silently: the tooltip then
  // shows the PDF's own References text instead. No status chip — data absence
  // is not an error state.
  useEffect(() => {
    if (!ctx.projectOpen || pdfFile) return;
    const key = `${(ctx.pdfArtifact?.pdf ?? "main.pdf").replace(/\.pdf$/, "")}@${outputTick}`;
    let cancelled = false;
    void (async () => {
      try {
        const stem = (ctx.pdfArtifact?.pdf ?? "main.pdf").replace(/\.pdf$/, "");
        const map = await loadCompiledRefs(stem);
        if (cancelled || !map) return;
        refsCacheRef.current = { key, map };
        refsRef.current = map;
      } catch {
        /* silent: the tooltip falls back to raw entry text */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx.projectOpen, ctx.projectRoot, outputTick, pdfFile, ctx.pdfArtifact]);

  // Forward search (M3): editor click → scroll to the line + flash it.
  useEffect(() => {
    const req = ctx.pdfSync;
    const data = synctexRef.current;
    if (!req || !data) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    let flashTimer: number | undefined;
    let flash: HTMLDivElement | null = null;
    const apply = (attempt: number) => {
      if (cancelled) return;
      const host = hostRef.current;
      const hit = forwardLookup(data, req.file, req.line);
      if (!host || !hit) return;
      const pageDiv = host.children[hit.page - 1] as HTMLElement | undefined;
      // The render loop may still be filling the host after a fresh compile.
      if (!pageDiv) {
        if (attempt < 20) retryTimer = window.setTimeout(() => apply(attempt + 1), 250);
        return;
      }
      const scale = parseFloat(pageDiv.style.getPropertyValue("--scale-factor")) || zoom / 100;
      const hostRect = host.getBoundingClientRect();
      const pageRect = pageDiv.getBoundingClientRect();
      host.scrollTo({
        top: Math.max(0, host.scrollTop + (pageRect.top - hostRect.top) + hit.yPt * scale - host.clientHeight / 2),
        left: Math.max(0, host.scrollLeft + (pageRect.left - hostRect.left) + hit.xPt * scale - 80),
        behavior: "smooth",
      });
      flash = document.createElement("div");
      flash.className = "pdf-sync-flash";
      flash.style.left = `${hit.xPt * scale}px`;
      flash.style.top = `${(hit.yPt - 8) * scale}px`;
      flash.style.width = `${140 * scale}px`;
      flash.style.height = `${12 * scale}px`;
      pageDiv.appendChild(flash);
      flashTimer = window.setTimeout(() => {
        flash?.remove();
        flash = null;
      }, 1700);
    };
    apply(0);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (flashTimer !== undefined) window.clearTimeout(flashTimer);
      flash?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.pdfSync, synctexTick]);

  // Inverse search (M3) + citation jump (issue 26): a click on a page either
  // jumps to the reference entry of a clicked citation or opens the source
  // file at that line. Drags (text selection) are ignored via pointer-down
  // distance.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onClick = (e: MouseEvent) => {
      tipHideRef.current?.(); // a click dismisses the tooltip (issue 27)
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) return;
      const pageDiv = (e.target as HTMLElement).closest(".pdf-page") as HTMLElement | null;
      if (!pageDiv) return;
      const pageIndex = Array.prototype.indexOf.call(host.children, pageDiv);
      if (pageIndex < 0) return;
      const rect = pageDiv.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Citation jump first: hit-test the scanned [...] groups. A hit whose
      // number is in the bibliography index wins; otherwise fall through to
      // inverse search (e.g. a bracketed year, or no references section).
      const cite = citeIndexRef.current.find(
        (c) =>
          c.page === pageIndex + 1 &&
          localX >= c.group.box.x0 - 2 &&
          localX <= c.group.box.x1 + 2 &&
          localY >= c.group.box.y0 - 2 &&
          localY <= c.group.box.y1 + 2,
      );
      if (cite) {
        const g = cite.group;
        let n = g.numbers[0];
        for (let i = 0; i < g.subBoxes.length; i++) {
          if (localX >= g.subBoxes[i].x0 && localX <= g.subBoxes[i].x1) {
            n = g.numbers[i];
            break;
          }
        }
        const bib = bibIndexRef.current.get(n);
        if (bib) {
          const target = host.children[bib.page - 1] as HTMLElement | undefined;
          if (target) {
            const scale = parseFloat(target.style.getPropertyValue("--scale-factor")) || 1;
            const hostRect = host.getBoundingClientRect();
            const pageRect = target.getBoundingClientRect();
            host.scrollTo({
              top: Math.max(
                0,
                host.scrollTop +
                  (pageRect.top - hostRect.top) +
                  bib.yTopPx +
                  bib.lineHpx / 2 -
                  host.clientHeight / 2,
              ),
              left: Math.max(0, host.scrollLeft + (pageRect.left - hostRect.left) + bib.xPx - 80),
              behavior: "smooth",
            });
            flashBoxIn(target, {
              x0: bib.xPx,
              y0: bib.yTopPx - 2 * scale,
              x1: bib.x1Px,
              y1: bib.yTopPx + bib.lineHpx,
            });
          }
          setBackTarget({ page: pageIndex + 1, box: g.box, label: `[${n}]`, left: host.scrollLeft });
          return; // inverse search is suppressed for this click
        }
      }

      const data = synctexRef.current;
      if (!data) return;
      const scale = parseFloat(pageDiv.style.getPropertyValue("--scale-factor")) || 1;
      const hit = reverseLookup(data, pageIndex + 1, localX / scale, localY / scale);
      if (hit) ctxRef.current.syncToEditor(hit.file, hit.line);
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("click", onClick);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("click", onClick);
    };
  }, []);

  // Citation hover tooltip (issue 27): an imperative node in .pdf-pane — a
  // small card with the reference's title, authors and DOI (or the raw entry
  // text when only the PDF's own References section is available). Shown 200 ms
  // after the pointer rests on a .pdf-cite marker; leave / scroll / click /
  // re-render hide it at once; moving between adjacent citations swaps the
  // content in place. No animation (v0 motion rule).
  useEffect(() => {
    const host = hostRef.current;
    const pane = paneRef.current;
    if (!host || !pane) return;
    let tip: HTMLDivElement | null = null;
    let timer: number | undefined;
    let target: HTMLElement | null = null; // marker shown, or pending its timer
    let lastX = 0;
    let lastY = 0;

    const ensureTip = () => {
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "pdf-cite-tip";
        tip.style.display = "none";
        pane.appendChild(tip);
      }
      return tip;
    };
    const hide = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      target = null;
      if (tip) tip.style.display = "none";
    };
    tipHideRef.current = hide;

    // Fill the tooltip from the reference data for every number in the
    // marker's group — [2,3] shows both references (issue 34). Entries are
    // capped so a wide range citation cannot grow the card unboundedly.
    const MAX_TIP_ENTRIES = 6;
    const fillTip = (marker: HTMLElement): boolean => {
      const el = ensureTip();
      el.textContent = "";
      const nums = (marker.dataset.cite ?? "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      let shown = 0;
      for (const n of nums) {
        if (shown >= MAX_TIP_ENTRIES) break;
        const info = refsRef.current?.get(n);
        if (!info) continue;
        const entry = document.createElement("div");
        entry.className = "pdf-cite-tip-entry";
        if (info.title || info.authors || info.doi) {
          if (info.title) {
            const t = document.createElement("div");
            t.className = "pdf-cite-tip-title";
            t.textContent = info.title;
            entry.appendChild(t);
          }
          if (info.authors) {
            const a = document.createElement("div");
            a.className = "pdf-cite-tip-authors";
            a.textContent = info.authors;
            entry.appendChild(a);
          }
          if (info.doi) {
            const d = document.createElement("div");
            d.className = "pdf-cite-tip-doi";
            d.textContent = `doi: ${info.doi}`;
            entry.appendChild(d);
          }
        } else if (info.raw) {
          const r = document.createElement("div");
          r.className = "pdf-cite-tip-raw";
          r.textContent = info.raw;
          entry.appendChild(r);
        } else {
          continue;
        }
        el.appendChild(entry);
        shown += 1;
      }
      if (shown === 0) return false;
      const hidden = nums.length - shown;
      if (hidden > 0) {
        const more = document.createElement("div");
        more.className = "pdf-cite-tip-more";
        more.textContent = `\u2026 plus ${hidden} more`;
        el.appendChild(more);
      }
      return true;
    };

    // Fixed at cursor + (12, 16); flipped above the cursor when it would
    // overflow the viewport bottom, clamped horizontally.
    const position = () => {
      if (!tip) return;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let x = lastX + 12;
      let y = lastY + 16;
      if (y + h > window.innerHeight - 8) y = lastY - h - 12;
      x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    };

    const onOver = (e: MouseEvent) => {
      const m = (e.target as HTMLElement).closest?.(".pdf-cite") as HTMLElement | null;
      if (!m) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (target === m && tip && tip.style.display !== "none") return; // already here
      target = m;
      const el = ensureTip();
      if (el.style.display !== "none") {
        // Moving between adjacent citations: swap content in place, no flicker.
        if (fillTip(m)) position();
        else hide();
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        const t = target;
        if (!t) return;
        if (fillTip(t)) {
          el.style.display = "block";
          position();
        }
      }, 200);
    };

    const onOut = (e: MouseEvent) => {
      const m = (e.target as HTMLElement).closest?.(".pdf-cite") as HTMLElement | null;
      if (!m || m !== target) return;
      // Straight onto another citation? The next mouseover swaps in place.
      const next = (e.relatedTarget as Element | null)?.closest?.(".pdf-cite");
      if (next) return;
      hide();
    };

    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (tip && tip.style.display === "none") return; // pending — position on show
      if (target) position();
    };

    host.addEventListener("mouseover", onOver);
    host.addEventListener("mouseout", onOut);
    host.addEventListener("mousemove", onMove);
    host.addEventListener("scroll", hide, { passive: true });
    return () => {
      host.removeEventListener("mouseover", onOver);
      host.removeEventListener("mouseout", onOut);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("scroll", hide);
      tipHideRef.current = null;
      hide();
      tip?.remove();
    };
  }, []);

  // Back pill (issue 26): smooth-scroll back to the clicked citation and flash
  // it. Dismissed by ✕, Escape, a new jump, or any re-render.
  const goBack = () => {
    const t = backTarget;
    if (!t) return;
    setBackTarget(null);
    const host = hostRef.current;
    const pageDiv = host ? (host.children[t.page - 1] as HTMLElement | undefined) : undefined;
    if (!host || !pageDiv) return;
    const hostRect = host.getBoundingClientRect();
    const pageRect = pageDiv.getBoundingClientRect();
    const cy = (t.box.y0 + t.box.y1) / 2;
    // Restore the exact clicked position: the horizontal offset is saved at
    // click time so the marker sits where it did when it was clicked.
    host.scrollTo({
      top: Math.max(0, host.scrollTop + (pageRect.top - hostRect.top) + cy - host.clientHeight / 2),
      left: t.left,
      behavior: "smooth",
    });
    flashBoxIn(pageDiv, t.box);
  };

  useEffect(() => {
    if (!backTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBackTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backTarget]);

  useEffect(
    () => () => {
      if (docRef.current) void docRef.current.destroy();
      docRef.current = null;
    },
    [],
  );

  const nudgeZoom = (d: number) => setSetting("zoom", Math.max(50, Math.min(300, zoom + d)));

  /** One-click: copy the compiled output into versions/ as a timestamped version. */
  const saveVersion = async () => {
    const artifact = ctx.pdfArtifact?.pdf;
    if (!artifact || saving) return;
    setSaving(true);
    try {
      const r = await api.saveVersion(artifact);
      setSavedNote(`saved ${r.path}`);
      ctx.bumpTree(); // the versions/ folder shows up in the Explorer
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openSaveAs = () => {
    if (pdfFile) {
      const i = pdfFile.lastIndexOf("/");
      const name = i === -1 ? pdfFile : pdfFile.slice(i + 1);
      const dot = name.lastIndexOf(".");
      const copyName = dot === -1 ? name + "-copy" : name.slice(0, dot) + "-copy" + name.slice(dot);
      setSaveAsPath((i === -1 ? "" : pdfFile.slice(0, i + 1)) + copyName);
    } else {
      const stem = (ctx.pdfArtifact?.pdf ?? "main.pdf").replace(/\.pdf$/, "");
      setSaveAsPath(stem + ".pdf");
    }
    setSaveAsError(null);
    setSaveAsOpen(true);
  };

  const doSaveAs = async () => {
    const to = saveAsPath.trim();
    if (!to || saving) return;
    setSaving(true);
    try {
      const from = pdfFile ?? ".workbench/build/" + (ctx.pdfArtifact?.pdf ?? "main.pdf");
      const r = await api.copyFile(from, to);
      setSaveAsOpen(false);
      setSavedNote(`saved ${r.to}`);
      ctx.bumpTree();
    } catch (e) {
      setSaveAsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // The "saved …" note fades out on its own.
  useEffect(() => {
    if (!savedNote) return;
    const t = window.setTimeout(() => setSavedNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [savedNote]);

  const jobRunning = !!ctx.job && ctx.job.status === "running";
  // A compile finished while a static file was open → offer the fresh output.
  const freshOutput =
    !!pdfFile && versionAtOpenRef.current !== null && ctx.pdfVersion !== versionAtOpenRef.current;
  // Compile state for the header: the PDF only changes when a compile succeeds,
  // so say what is happening - and where to look when it fails.
  const compileJob = ctx.job?.kind === "compile" ? ctx.job : null;
  const compiling = !!compileJob && compileJob.status === "running";
  const compileFailed =
    !!compileJob && (compileJob.status === "error" || (compileJob.status === "done" && compileJob.exit_code !== 0));

  return (
    <div className="pdf-pane" ref={paneRef}>
      <div className="pane-header">
        {pdfFile ? (
          <>
            <span title={pdfFile}>{baseName(pdfFile)}</span>
            <span className="badge" title="Static project file — read-only, no SyncTeX">file</span>
            <button type="button" className="mini" onClick={() => ctx.onShowMainPdf()} title="Show the compiled main.pdf output">
              Compiled output
            </button>
            {freshOutput && (
              <button type="button" className="mini active" onClick={() => ctx.onShowMainPdf()} title="A compile finished while this file was open — view the new main.pdf">
                New output
              </button>
            )}
          </>
        ) : (
          <span>PDF preview</span>
        )}
        {status && <span className="muted">{status}</span>}
        {!pdfFile && compiling && <span className="chip running">compiling...</span>}
        {!pdfFile && compileFailed && (
          <button type="button" className="mini danger" onClick={() => ctx.onShowLog()} title="The last compile failed - open the Run Log to see why">
            Compile failed - Run Log
          </button>
        )}
        {savedNote && <span className="chip done" title="A copy was saved into the project">{savedNote}</span>}
        <span className="head-spacer" />
        {!pdfFile && ctx.project && (
          <button
            type="button"
            className="mini"
            onClick={() => void saveVersion()}
            disabled={saving}
            title="Save this compiled output as a version in versions/ (timestamped, Overleaf-style)"
          >
            Save version
          </button>
        )}
        {ctx.projectOpen && (
          <button
            type="button"
            className="mini"
            onClick={openSaveAs}
            disabled={saving}
            title={pdfFile ? "Copy this file to another path in the project" : "Save the compiled output as a file in the project"}
          >
            Save As…
          </button>
        )}
        <button type="button" className="mini" onClick={() => nudgeZoom(-25)} title="Zoom out">−</button>
        <span className="zoom-label" title="Zoom">{zoom}%</span>
        <button type="button" className="mini" onClick={() => nudgeZoom(25)} title="Zoom in">+</button>
        <button
          type="button"
          className="head-gear"
          title="PDF settings"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      <div className="pdf-host" ref={hostRef} />
      {backTarget && (
        <div className="pdf-back-pill">
          <button type="button" onClick={goBack} title="Scroll back to the citation you clicked">
            ← back to {backTarget.label} · p. {backTarget.page}
          </button>
          <button
            type="button"
            className="pdf-back-pill-x"
            onClick={() => setBackTarget(null)}
            title="Dismiss (Esc)"
          >
            ✕
          </button>
        </div>
      )}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="PDF settings"
          controls={PDF_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
      {saveAsOpen && ctx.project && (
        <div className="modal-backdrop" onClick={() => setSaveAsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="pane-header"><span>Save As</span></div>
            <div className="modal-body">
              <input
                autoFocus
                value={saveAsPath}
                onChange={(e) => setSaveAsPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doSaveAs();
                }}
                placeholder="versions/main.pdf"
              />
              <div className="muted">
                {pdfFile ? (
                  <>Copy <code>{pdfFile}</code> to the path below. Existing files are not overwritten.</>
                ) : (
                  <>Save the compiled output (<code>.workbench/build/{ctx.pdfArtifact?.pdf ?? "main.pdf"}</code>) as a project file. Existing files are not overwritten.</>
                )}
              </div>
              {saveAsError && <div className="tree-error">{saveAsError}</div>}
              <div className="card-actions">
                <button onClick={() => setSaveAsOpen(false)}>Cancel</button>
                <button className="primary" disabled={!saveAsPath.trim() || saving} onClick={() => void doSaveAs()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
