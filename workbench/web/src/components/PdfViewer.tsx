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
  }, [ctx.projectOpen, ctx.projectRoot, outputTick, zoom, pdfFile, ctx.pdfArtifact]);

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
    <div className="pdf-pane">
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
