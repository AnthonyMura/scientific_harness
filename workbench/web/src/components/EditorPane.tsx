// Editor module: CodeMirror with the Vesper palette. Font size and line height
// apply live via CSS vars; tab size / word wrap recreate the view. Cursor
// shape (line/block/underline) and smooth motion are data attributes — live too.
import React, { useEffect, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { latexLanguage } from "../latexMode";
import { vesperHighlight } from "../vesperTheme";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { GearIcon } from "../icons";

export const EDITOR_SETTINGS: SettingControl[] = [
  { kind: "number", key: "fontSize", label: "Font size", min: 10, max: 28, step: 1, unit: "px" },
  { kind: "number", key: "lineHeight", label: "Line height", min: 1.3, max: 2.4, step: 0.1 },
  { kind: "number", key: "tabSize", label: "Tab size", min: 2, max: 8, step: 2, unit: "sp" },
  { kind: "toggle", key: "wrap", label: "Word wrap" },
  { kind: "select", key: "cursorType", label: "Cursor type", options: ["line", "block", "underline"] },
  { kind: "toggle", key: "smoothCursor", label: "Smooth cursor motion" },
];
export const EDITOR_DEFAULTS: ModuleSettings = {
  fontSize: 15, lineHeight: 1.7, tabSize: 4, wrap: false, cursorType: "line", smoothCursor: true,
};

/** Language mode by extension: md/markdown → Markdown, tex/sty/cls → LaTeX;
 *  anything else (.txt, .bib, .json, ...) opens as plain text. */
function langForPath(p: string): Extension[] {
  const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return [markdown()];
  if (ext === "tex" || ext === "sty" || ext === "cls") return [latexLanguage];
  return [];
}

/** Vesper chrome: the text cursor in brick, the palette's accent red. */
const vesperChrome = EditorView.theme({
  "& .cm-cursor": { borderLeftColor: "var(--brick)" },
});

interface Props {
  ctx: AppCtx;
  filePath: string | null;
}

export default function EditorPane({ ctx, filePath }: Props) {
  const [settings, setSetting] = useModuleSettings("editor", EDITOR_DEFAULTS);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const syncRef = useRef(ctx.syncToPdf);
  syncRef.current = ctx.syncToPdf;
  const gotoRef = useRef(ctx.editorGoto);
  gotoRef.current = ctx.editorGoto;
  const savedRef = useRef<(path: string) => void>(() => {});
  savedRef.current = ctx.onFileSaved;
  const [viewTick, setViewTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  /** Select a whole line and center it in the viewport (inverse search). */
  const applyGoto = (view: EditorView, lineNo: number) => {
    const n = Math.max(1, Math.min(lineNo, view.state.doc.lines));
    const l = view.state.doc.line(n);
    view.dispatch({
      selection: { anchor: l.from, head: l.to },
      effects: EditorView.scrollIntoView(l.from, { y: "center" }),
    });
    view.focus();
  };

  useEffect(() => {
    if (!filePath || !hostRef.current) return;
    let cancelled = false;
    let view: EditorView | null = null;
    (async () => {
      const r = await api.readFile(filePath);
      if (cancelled || !hostRef.current) return;
      const lang = langForPath(filePath);
      const save = () => {
        if (!view) return;
        void api
          .writeFile(filePath, view.state.doc.toString())
          .then(() => {
            setDirty(false);
            savedRef.current(filePath); // auto-compile on save (M3)
          })
          .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      };
      saveRef.current = save;
      const tabSize = typeof settings.tabSize === "number" ? settings.tabSize : 4;
      const wrap = !!settings.wrap;
      view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: r.content,
          extensions: [
            history(),
            autocompletion(),
            highlightSelectionMatches(),
            bracketMatching(),
            syntaxHighlighting(vesperHighlight),
            vesperChrome,
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              ...completionKeymap,
              indentWithTab,
              { key: "Mod-s", run: () => { saveRef.current(); return true; } },
            ]),
            lang,
            ...(wrap ? [EditorView.lineWrapping] : []),
            EditorView.domEventHandlers({
              // Forward search (M3): a click jumps the PDF to this line.
              click(event, view) {
                if (!filePath || !filePath.endsWith(".tex")) return false;
                const e = event as MouseEvent;
                const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                if (pos == null) return false;
                syncRef.current(filePath, view.state.doc.lineAt(pos).number);
                return false;
              },
            }),
            EditorState.tabSize.of(tabSize),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(true);
            }),
          ],
        }),
      });
      viewRef.current = view;
      setError(null);
      setViewTick((t) => t + 1);
      // A reverse-sync jump may have arrived while this file was loading.
      const g = gotoRef.current;
      if (g && g.file === filePath) applyGoto(view, g.line);
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
      view?.destroy();
      if (viewRef.current === view) viewRef.current = null;
      setDirty(false);
    };
    // tabSize/wrap recreate the view; fontSize/lineHeight are live CSS vars.
    // projectRoot: switching projects must reload even for identical file names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, ctx.projectRoot, settings.tabSize, settings.wrap]);

  // Inverse search (M3): PDF click → jump to the line. Re-runs on
  // viewTick because the view is created asynchronously after a load.
  useEffect(() => {
    const g = ctx.editorGoto;
    if (!g || !filePath || g.file !== filePath) return;
    const view = viewRef.current;
    if (view) applyGoto(view, g.line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.editorGoto, filePath, viewTick]);

  const fs = typeof settings.fontSize === "number" ? settings.fontSize : 15;
  const lh = typeof settings.lineHeight === "number" ? settings.lineHeight : 1.7;
  // Cursor shape + smooth motion apply live via data attributes (no view recreation).
  const cursorType = typeof settings.cursorType === "string" ? settings.cursorType : "line";
  const smoothCursor = !!settings.smoothCursor;

  return (
    <div
      className="editor-pane"
      data-cursor={cursorType}
      data-smooth={smoothCursor ? "on" : "off"}
      style={{ "--cm-fs": `${fs}px`, "--cm-lh": String(lh) } as React.CSSProperties}
    >
      <div className="pane-header">
        <span>{filePath ?? "no file selected"}</span>
        <span className={"dot" + (dirty ? " dirty" : "")} title={dirty ? "unsaved changes" : "saved"} />
        {filePath && (
          <button className="mini" onClick={() => saveRef.current()} disabled={!dirty}>
            Save
          </button>
        )}
        <span className="head-spacer" />
        <button
          type="button"
          className="head-gear"
          title="Editor settings"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      {error && <div className="tree-error">{error}</div>}
      {filePath ? (
        <div className="editor-host" ref={hostRef} />
      ) : (
        <div className="pane-empty">No file selected — click a file in the Explorer, or open a new project.</div>
      )}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="Editor settings"
          controls={EDITOR_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
    </div>
  );
}
