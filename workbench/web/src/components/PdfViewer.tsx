// PDF preview module ("latex compilation" output): renders main.pdf with
// pdf.js; zoom is a module setting adjustable from the header. Pages keep
// their natural size and the host scrolls in both directions; a transparent
// text layer over each canvas makes the text selectable.
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
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
  const [status, setStatus] = useState<string>("");
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

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
