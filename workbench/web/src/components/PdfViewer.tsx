// PDF module: reads any project PDF in a single pane. Two modes —
// "compiled output" (main.pdf from LaTeX, with SyncTeX and the compile
// controls) and a static file opened from the Explorer (read-only, no sync).
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
import type { SshConfig } from "../types";
import { COMPILE_TARGETS, hasWslTarget, installHint, needsInstall, targetTooltip } from "../modules/targets-ui";
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
  const [showSsh, setShowSsh] = useState(false);
  const [draft, setDraft] = useState<SshConfig>({});
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
  }, [ctx.projectOpen, ctx.projectRoot, ctx.pdfVersion, pdfFile]);

  useEffect(() => {
    if (!ctx.projectOpen || !hostRef.current) return;
    let cancelled = false;
    const textLayers: pdfjsLib.TextLayer[] = [];
    (async () => {
      try {
        // Compiled output comes from the artifact endpoint; anything else is a
        // raw project file (the PDF library).
        const blob = pdfFile ? await api.fetchRawFile(pdfFile) : await api.fetchPdf("main.pdf");
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
  }, [ctx.projectOpen, ctx.projectRoot, outputTick, zoom, pdfFile]);

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

  const openSshForm = () => {
    setDraft(ctx.project?.ssh ?? {});
    setShowSsh(true);
  };
  const saveSsh = () => {
    ctx.onSaveSsh(draft);
    setShowSsh(false);
  };

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
          <>
            <span>PDF preview</span>
            {ctx.project && (
              <label className="auto-compile" title="Compile automatically after saving a .tex file">
                <input type="checkbox" checked={ctx.autoCompile} onChange={(e) => ctx.onAutoCompile(e.target.checked)} />
                Auto-compile
              </label>
            )}
          </>
        )}
        {status && <span className="muted">{status}</span>}
        {!pdfFile && compiling && <span className="chip running">compiling...</span>}
        {!pdfFile && compileFailed && (
          <button type="button" className="mini danger" onClick={() => ctx.onShowLog()} title="The last compile failed - open the Run Log to see why">
            Compile failed - Run Log
          </button>
        )}
        <span className="head-spacer" />
        {!pdfFile && ctx.project && (
          <span className="target-pick">
            <span className="target-label">Target</span>
            <select
              value={ctx.project.target}
              onChange={(e) => ctx.onTarget(e.target.value)}
              title={targetTooltip(ctx.project.target, ctx.targetStatuses)}
            >
              {!(COMPILE_TARGETS as readonly string[]).includes(ctx.project.target) && (
                <option value={ctx.project.target} disabled>{ctx.project.target} — unavailable</option>
              )}
              <option value="auto">Auto</option>
              <option value="local">Local (host TeX)</option>
              {hasWslTarget(ctx.targetStatuses) && <option value="wsl">WSL</option>}
              <option value="ssh">SSH (remote)</option>
            </select>
            {needsInstall(ctx.project.target, ctx.targetStatuses) && (
              <button type="button" className="target-warn" title={installHint(ctx.project.target, ctx.targetStatuses)} onClick={() => ctx.onShowInstall()}>
                TeX missing — install
              </button>
            )}
            <button type="button" className="target-ssh" onClick={openSshForm} title="Configure the SSH compile target (host, user, key)">
              SSH…
            </button>
          </span>
        )}
        {!pdfFile && (jobRunning ? (
          <button onClick={() => ctx.onCancelJob()} className="danger">Cancel</button>
        ) : (
          <button onClick={() => ctx.onCompile()} disabled={!ctx.projectOpen} className="primary">Compile</button>
        ))}
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
      {showSsh && ctx.project && (
        <div className="ssh-form">
          <h4>SSH compile target — {ctx.project.name}</h4>
          <label>Host
            <input
              value={draft.host ?? ""}
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
              placeholder="labserver"
            />
          </label>
          <label>User
            <input
              value={draft.user ?? ""}
              onChange={(e) => setDraft({ ...draft, user: e.target.value })}
              placeholder="alice"
            />
          </label>
          <label>Port
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.port ?? 22}
              onChange={(e) =>
                setDraft({ ...draft, port: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label>Key path
            <input
              value={draft.key ?? ""}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder="blank = default ssh keys"
            />
          </label>
          <label>Remote dir
            <input
              value={draft.remote_dir ?? ""}
              onChange={(e) => setDraft({ ...draft, remote_dir: e.target.value })}
              placeholder={`~/workbench/${ctx.project.name}`}
            />
          </label>
          <p className="ssh-form-note">
            Key-based auth only (no password prompts). The project is synced up before each compile;
            PDF + SyncTeX are pulled back. The remote machine needs TeX Live + latexmk.
          </p>
          <div className="ssh-form-actions">
            <button className="primary" onClick={saveSsh} disabled={!draft.host || !draft.user}>Save</button>
            <button onClick={() => setShowSsh(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
