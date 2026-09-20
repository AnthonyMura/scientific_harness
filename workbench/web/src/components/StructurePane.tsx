// Structure module (issue 38): the document outline. Sections → subsections
// → subsubsections (→ \paragraph) for .tex, ATX headings for .md, and the
// PDF's own bookmark tree when the PDF pane is focused. Clicking a row moves
// the editor cursor or scrolls the PDF to that place; the tree re-parses as
// the document changes (editor mode) or the displayed PDF refreshes.
import React, { useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { computeStructure } from "../latexStructure";
import { computeMarkdownHeadings } from "../markdownStructure";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { ChevronDownIcon, ChevronRightIcon, CollapseAllIcon, GearIcon } from "../icons";

// pdf.js is a shared singleton with the PDF pane; point its worker at the
// bundled chunk (idempotent — the same URL the PDF pane already sets).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const STRUCTURE_SETTINGS: SettingControl[] = [
  { kind: "toggle", key: "showParagraphs", label: "Show \\paragraph rows" },
  { kind: "toggle", key: "showLineNumbers", label: "Show line numbers" },
];
export const STRUCTURE_DEFAULTS: ModuleSettings = { showParagraphs: true, showLineNumbers: true };

/** What the outline currently describes (last-focused pane wins). */
type Target = { kind: "tex"; file: string } | { kind: "md"; file: string } | { kind: "pdf" } | null;

interface Row {
  /** Stable identity for collapse state (survives re-parses of small edits). */
  key: string;
  /** 0-based indent level. */
  depth: number;
  title: string;
  /** Tag badge: S/SS tag (.tex), h-level (.md), page number (PDF). */
  badge: string | null;
  /** Editor mode: 1-based source line to jump to. */
  line: number | null;
  /** PDF mode: 1-based page of the destination. */
  page: number | null;
  /** PDF mode: destination top in points from the page bottom (null = top). */
  topPt: number | null;
  hasChildren: boolean;
}

/** Debounce for editor-change re-parses (keystrokes arrive per transaction). */
const DEBOUNCE_MS = 150;

// --- PDF outline types (pdf.js leaves destinations loosely typed) -----------

interface OutlineItem {
  title: string | null;
  dest: unknown;
  items?: OutlineItem[];
}

/** Resolve a bookmark destination to (page, top in PDF points from the bottom).
 *  Handles page-ref arrays ([{num,gen}, {name:"XYZ"}, x, y, zoom]), named
 *  destinations (string ids) and the degenerate cases pdf.js leaves behind. */
async function resolveDest(
  doc: PDFDocumentProxy,
  dest: unknown,
): Promise<{ page: number | null; topPt: number | null }> {
  let ref: unknown = null;
  let topPt: number | null = null;
  if (Array.isArray(dest)) {
    const first = dest[0] as { num?: number } | undefined;
    if (first && typeof first.num === "number") ref = first;
    // XYZ carries the destination top in PDF points from the page bottom.
    const type = dest[1];
    if (type && typeof type === "object" && (type as { name?: string }).name === "XYZ") {
      const y = dest[3];
      if (typeof y === "number") topPt = y;
    }
  } else if (typeof dest === "string") {
    try {
      // Named destination → [ref, …] or null.
      const d = await doc.getDestination(dest);
      if (Array.isArray(d) && d[0] && typeof (d[0] as { num?: number }).num === "number") ref = d[0];
    } catch {
      // Unresolvable name — the row still shows, without a page.
    }
  }
  if (!ref) return { page: null, topPt };
  try {
    const idx = await doc.getPageIndex(ref as { num: number; gen: number });
    if (idx < 0) return { page: null, topPt };
    return { page: idx + 1, topPt };
  } catch {
    return { page: null, topPt };
  }
}

export default function StructurePane({ ctx }: { ctx: AppCtx }) {
  const [settings, setSetting] = useModuleSettings("structure", STRUCTURE_DEFAULTS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);
  /** Debounced editor-change re-parse tick. */
  const [tick, setTick] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfRows, setPdfRows] = useState<Row[] | null>(null);

  /** Which document the outline follows: a focused PDF pane wins (last-
   *  focused), else the focused editor tab's file (.tex / .md only). */
  const target: Target = useMemo(() => {
    if (!ctx.projectOpen) return null;
    if (ctx.pdfFocused) return { kind: "pdf" };
    if (!ctx.editorFocused) return null;
    const f = ctx.activeFile;
    if (!f) return null;
    if (f.endsWith(".tex")) return { kind: "tex", file: f };
    if (f.endsWith(".md") || f.endsWith(".markdown")) return { kind: "md", file: f };
    return null;
  }, [ctx.projectOpen, ctx.pdfFocused, ctx.editorFocused, ctx.activeFile]);

  const showParagraphs = !!settings.showParagraphs;
  const showLines = !!settings.showLineNumbers;

  // --- editor mode: parse the live document --------------------------------

  const editorRows = useMemo<Row[] | null>(() => {
    if (!target || target.kind === "pdf") return null;
    const text = ctx.editorContent(target.file);
    if (text == null) return null; // tab still loading
    void tick; // re-run when a debounced change lands
    let rows: Row[];
    if (target.kind === "tex") {
      const hs = computeStructure(text).filter((h) => showParagraphs || h.level <= 3);
      rows = hs.map((h) => ({
        key: `tex:${h.tag}|${h.title}`,
        depth: h.level - 1,
        title: h.title || "(untitled)",
        badge: h.tag,
        line: h.line,
        page: null,
        topPt: null,
        hasChildren: false,
      }));
    } else {
      const hs = computeMarkdownHeadings(text);
      rows = hs.map((h) => ({
        key: `md:${h.level}|${h.title}`,
        depth: h.level - 1,
        title: h.title || "(untitled)",
        badge: `h${h.level}`,
        line: h.line,
        page: null,
        topPt: null,
        hasChildren: false,
      }));
    }
    // A row has children when the next row is indented deeper than it.
    for (let i = 0; i + 1 < rows.length; i++) {
      if (rows[i + 1].depth > rows[i].depth) rows[i].hasChildren = true;
    }
    return rows;
  }, [target, ctx.editorContent, tick, showParagraphs]);

  // Re-parse on document changes of the target file (debounced).
  useEffect(() => {
    if (!target || target.kind === "pdf") return;
    let timer: number | undefined;
    const unsub = ctx.subscribeEditorContent(target.file, () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => setTick((t) => t + 1), DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [target, ctx.subscribeEditorContent]);

  // --- PDF mode: read the displayed PDF's own outline ----------------------

  useEffect(() => {
    if (!target || target.kind !== "pdf") return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      setPdfLoading(true);
      setPdfError(null);
      try {
        // The same source the PDF pane renders: the compiled artifact, or the
        // statically opened file.
        const blob = ctx.pdfFile
          ? await api.fetchRawFile(ctx.pdfFile)
          : await api.fetchPdf(ctx.pdfArtifact?.pdf ?? "main.pdf");
        if (cancelled) return;
        if (!blob) throw new Error("could not read the PDF");
        const data = new Uint8Array(await blob.arrayBuffer());
        doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        // pdf.js 4.x returns the outline as a flat array of nodes (or null).
        const raw = (await doc.getOutline()) as unknown as OutlineItem[] | null;
        if (cancelled) return;
        const liveDoc = doc; // stable non-null handle for destination resolution
        const rows: Row[] = [];
        const walk = async (items: OutlineItem[], depth: number, parentKey: string): Promise<void> => {
          for (const it of items) {
            const d = await resolveDest(liveDoc, it.dest);
            const title = (it.title ?? "").trim() || "(untitled)";
            const key = `${parentKey}/${depth}:${title}`;
            rows.push({
              key,
              depth,
              title,
              badge: d.page != null ? `p${d.page}` : null,
              line: null,
              page: d.page,
              topPt: d.topPt,
              hasChildren: (it.items?.length ?? 0) > 0,
            });
            if (it.items && it.items.length) await walk(it.items, depth + 1, key);
          }
        };
        if (raw) await walk(raw, 0, "root");
        if (!cancelled) setPdfRows(rows);
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : String(e));
      } finally {
        if (doc) void doc.destroy();
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (doc) void doc.destroy();
    };
  }, [target, ctx.projectRoot, ctx.pdfFile, ctx.pdfVersion, ctx.pdfArtifact]);

  // Drop stale PDF rows when the target leaves PDF mode.
  useEffect(() => {
    if (!target || target.kind !== "pdf") setPdfRows(null);
  }, [target]);

  const rows = target?.kind === "pdf" ? pdfRows : editorRows;

  // --- interaction -----------------------------------------------------------

  const onRowClick = (row: Row) => {
    if (!target) return;
    if (target.kind === "pdf") {
      // Scroll the PDF only — no SyncTeX round trip in this direction.
      if (row.page != null) ctx.gotoPdfPage(row.page, row.topPt);
      return;
    }
    if (row.line != null) ctx.syncToEditor(target.file, row.line);
  };

  const toggle = (key: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Hide rows whose nearest shallower ancestor is collapsed.
  const visible: Row[] = [];
  if (rows) {
    for (const r of rows) {
      let hidden = false;
      for (let j = visible.length - 1; j >= 0; j--) {
        if (visible[j].depth < r.depth) {
          hidden = collapsed.has(visible[j].key);
          break;
        }
      }
      if (!hidden) visible.push(r);
    }
  }

  // --- render -----------------------------------------------------------------

  const headLabel =
    target?.kind === "pdf"
      ? "PDF bookmarks"
      : target
        ? target.kind === "tex"
          ? "LaTeX sections"
          : "Markdown headings"
        : "Structure";

  const renderRows = () => (
    <div className="structure-scroll">
      {visible.map((r) => (
        <div key={r.key} className="structure-row" style={{ paddingLeft: 6 + r.depth * 14 }} onClick={() => onRowClick(r)}>
          <span
            className="twisty"
            onClick={(e) => {
              if (!r.hasChildren) return;
              e.stopPropagation();
              toggle(r.key);
            }}
          >
            {r.hasChildren ? (collapsed.has(r.key) ? <ChevronRightIcon size={13} /> : <ChevronDownIcon size={13} />) : null}
          </span>
          {r.badge && <span className="structure-tag">{r.badge}</span>}
          <span className="structure-title" title={r.title}>
            {r.title}
          </span>
          {showLines && r.line != null && <span className="structure-line">:{r.line}</span>}
        </div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (!ctx.projectOpen) {
    body = <div className="structure-empty">Open a project to see its structure.</div>;
  } else if (target == null) {
    body = (
      <div className="structure-empty">Focus an editor tab (.tex or .md) — or the PDF pane — to see its outline.</div>
    );
  } else if (target.kind === "pdf") {
    if (pdfLoading) body = <div className="structure-empty">Reading outline…</div>;
    else if (pdfError) body = <div className="structure-empty structure-error">{pdfError}</div>;
    else if (!rows || rows.length === 0)
      body = (
        <div className="structure-empty">
          This PDF has no outline. LaTeX compiled with hyperref gets bookmarks automatically; static PDFs may not have any.
        </div>
      );
    else body = renderRows();
  } else if (rows == null) {
    body = <div className="structure-empty">Loading document…</div>;
  } else if (rows.length === 0) {
    body = (
      <div className="structure-empty">
        {target.kind === "tex" ? "No sectioning commands in this file." : "No headings in this file."}
      </div>
    );
  } else {
    body = renderRows();
  }

  return (
    <div className="structure">
      <div className="pane-header">
        <span>{headLabel}</span>
        <span className="head-actions">
          {rows && rows.length > 0 && (
            <button type="button" title="Collapse all" onClick={() => setCollapsed(new Set(visible.map((r) => r.key)))}>
              <CollapseAllIcon size={14} />
            </button>
          )}
        </span>
        <button
          type="button"
          className="head-gear"
          title="Structure settings"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      {body}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="Structure settings"
          controls={STRUCTURE_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
    </div>
  );
}
