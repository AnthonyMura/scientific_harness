// PDF preview module ("latex compilation" output): renders main.pdf with
// pdf.js; zoom is a module setting adjustable from the header. Pages keep
// their natural size and the host scrolls in both directions; a transparent
// text layer over each canvas makes the text selectable. SyncTeX (M3): a click
// in the editor scrolls here to the matching line (forward search), and a
// click on a page jumps back to the source line (inverse search).
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { forwardLookup, parseSynctex, reverseLookup } from "../modules/synctex";
import type { SynctexData } from "../modules/synctex";
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

export default function PdfViewer({ ctx }: Props) {
  const [settings, setSetting] = useModuleSettings("pdf", PDF_DEFAULTS);
  const zoom = typeof settings.zoom === "number" ? settings.zoom : 125;
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const synctexRef = useRef<SynctexData | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [status, setStatus] = useState<string>("");
  const [synctexTick, setSynctexTick] = useState(0);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  // SyncTeX map for the current PDF (M3). Missing artifact → sync disabled.
  useEffect(() => {
    if (!ctx.projectOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const text = await api.fetchSynctex("main.synctex.gz");
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
  }, [ctx.projectOpen, ctx.projectRoot, ctx.pdfVersion]);

  useEffect(() => {
    if (!ctx.projectOpen || !hostRef.current) return;
    let cancelled = false;
    const textLayers: pdfjsLib.TextLayer[] = [];
    (async () => {
      try {
        const blob = await api.fetchPdf("main.pdf");
        if (cancelled) return;
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
        host.innerHTML = "";
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
        }
        if (!cancelled) setStatus("");
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      for (const l of textLayers) l.cancel();
    };
  }, [ctx.projectOpen, ctx.projectRoot, ctx.pdfVersion, zoom]);

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

  // Inverse search (M3): click a page → open the source file at that line.
  // Drags (text selection) are ignored via pointer-down distance.
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
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) return;
      const data = synctexRef.current;
      if (!data) return;
      const pageDiv = (e.target as HTMLElement).closest(".pdf-page") as HTMLElement | null;
      if (!pageDiv) return;
      const pageIndex = Array.prototype.indexOf.call(host.children, pageDiv);
      if (pageIndex < 0) return;
      const rect = pageDiv.getBoundingClientRect();
      const scale = parseFloat(pageDiv.style.getPropertyValue("--scale-factor")) || 1;
      const hit = reverseLookup(
        data,
        pageIndex + 1,
        (e.clientX - rect.left) / scale,
        (e.clientY - rect.top) / scale,
      );
      if (hit) ctxRef.current.syncToEditor(hit.file, hit.line);
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("click", onClick);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(
    () => () => {
      if (docRef.current) void docRef.current.destroy();
      docRef.current = null;
    },
    [],
  );

  const nudgeZoom = (d: number) => setSetting("zoom", Math.max(50, Math.min(300, zoom + d)));

  return (
    <div className="pdf-pane">
      <div className="pane-header">
        <span>PDF preview</span>
        {status && <span className="muted">{status}</span>}
        <span className="head-spacer" />
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
    </div>
  );
}
