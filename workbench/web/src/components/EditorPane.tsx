// Editor module: CodeMirror with the Vesper palette. Font size and line height
// apply live via CSS vars; tab size / word wrap recreate the view. Cursor
// shape (line/block/underline) and smooth motion are data attributes — live too.
import React, { useEffect, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { acceptCompletion, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { latexLanguage } from "../latexMode";
import { latexCompletionSource, latexCompletionTheme, reOpenEnvPicker } from "../latexCompletions";
import { bibLanguage } from "../bibMode";
import { formatBib } from "../bibFormat";
import { bibIndex } from "../bibIndex";
import { vesperHighlight } from "../vesperTheme";
import { api } from "../api";
import type { AppCtx } from "../modules/ctx";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { GearIcon } from "../icons";
import {
  DICTIONARY_OPTIONS,
  DEFAULT_DICTIONARY_LABEL,
  dictionaryCodeForLabel,
} from "../spellcheck/dictionaries";
import { spellDecoField, spellcheckPlugin, type SpellStatus } from "../spellcheck/decorations";

export const EDITOR_SETTINGS: SettingControl[] = [
  { kind: "number", key: "fontSize", label: "Font size", min: 10, max: 28, step: 1, unit: "px" },
  { kind: "number", key: "lineHeight", label: "Line height", min: 1.3, max: 2.4, step: 0.1 },
  { kind: "number", key: "tabSize", label: "Tab size", min: 2, max: 8, step: 2, unit: "sp" },
  { kind: "toggle", key: "wrap", label: "Word wrap" },
  { kind: "select", key: "cursorType", label: "Cursor type", options: ["line", "block", "underline"] },
  {
    kind: "number",
    key: "cursorLineWidth",
    label: "Cursor line width",
    min: 1,
    max: 6,
    step: 0.2,
    unit: "px",
    visibleWhen: { key: "cursorType", value: "line" },
  },
  { kind: "toggle", key: "smoothCursor", label: "Smooth cursor motion" },
  { kind: "toggle", key: "spellcheck", label: "Spell check" },
  {
    kind: "select",
    key: "spellLang",
    label: "Dictionary",
    options: DICTIONARY_OPTIONS,
    visibleWhen: { key: "spellcheck", value: true },
  },
];
export const EDITOR_DEFAULTS: ModuleSettings = {
  fontSize: 15, lineHeight: 1.7, tabSize: 4, wrap: false, cursorType: "line",
  cursorLineWidth: 1.2, smoothCursor: true,
  spellcheck: true, spellLang: DEFAULT_DICTIONARY_LABEL,
};

/** Autosave debounce: the disk follows the last keystroke after this pause. */
const AUTO_SAVE_MS = 1000;

/** Language mode by extension: md/markdown → Markdown, tex/sty/cls → LaTeX
 *  (with the Overleaf-style autocomplete overlay), bib/rbib → BibTeX;
 *  anything else (.txt, .json, ...) opens as plain text. */
function langForPath(p: string): Extension[] {
  const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return [markdown()];
  if (ext === "tex" || ext === "sty" || ext === "cls")
    return [latexLanguage, EditorState.languageData.of(() => [{ autocomplete: latexCompletionSource }]), latexCompletionTheme];
  if (ext === "bib" || ext === "rbib") return [bibLanguage];
  return [];
}

/** Vesper chrome: the text cursor in brick (the palette's accent red).
 *  drawSelection() makes CodeMirror render its own .cm-cursor element —
 *  without it only the browser's native caret is visible and these rules
 *  have nothing to style. Selection gets palette colors too, and the
 *  native caret is hidden entirely (drawSelection's ":focus -> initial"
 *  rule would otherwise let a second, text-colored caret show through). */
const vesperChrome = EditorView.theme({
  "& .cm-cursor, & .cm-dropCursor": { borderLeftColor: "var(--brick)" },
  "& .cm-selectionBackground": { background: "rgba(179, 143, 111, 0.25)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "rgba(179, 143, 111, 0.32)",
  },
  "& .cm-content": { caretColor: "transparent !important" },
  "& .cm-content:focus": { caretColor: "transparent !important" },
});

interface Props {
  ctx: AppCtx;
  filePath: string | null;
}

export default function EditorPane({ ctx, filePath }: Props) {
  const [settings, setSetting] = useModuleSettings("editor", EDITOR_DEFAULTS);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** Save the tab's document; notify=true also fires auto-compile on save. */
  const saveRef = useRef<((notify?: boolean) => Promise<boolean>)>(async () => true);
  const syncRef = useRef(ctx.syncToPdf);
  syncRef.current = ctx.syncToPdf;
  const gotoRef = useRef(ctx.editorGoto);
  gotoRef.current = ctx.editorGoto;
  const savedRef = useRef<(path: string) => void>(() => {});
  savedRef.current = ctx.onFileSaved;
  const [viewTick, setViewTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  // Ref mirror of `dirty` for the save-before-compile registration (stable closure).
  const dirtyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);
  /** Which .tex file the Compile button builds (per tab; defaults to the main file). */
  const [pick, setPick] = useState<string>("");
  /** Live mirror of the spell-check settings for the view plugin (stable closure). */
  const spellRef = useRef({ enabled: true, lang: DEFAULT_DICTIONARY_LABEL });
  spellRef.current = {
    enabled: !!settings.spellcheck,
    // The stored value is a display label; the checker works in codes.
    lang: dictionaryCodeForLabel(
      typeof settings.spellLang === "string" ? settings.spellLang : DEFAULT_DICTIONARY_LABEL,
    ),
  };
  /** Dictionary load state for the pane-header note (loading / error only). */
  const [spellStatus, setSpellStatus] = useState<SpellStatus>("idle");

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
    // Autosave debounce timer (effect-level so the cleanup can cancel it).
    let autoTimer: number | null = null;
    (async () => {
      const r = await api.readFile(filePath);
      if (cancelled || !hostRef.current) return;
      const lang = langForPath(filePath);
      // Writes serialize through a chain so an unmount flush can never race an
      // in-flight write (an older payload must not land after a newer one).
      let writeChain: Promise<unknown> = Promise.resolve();
      const save = (notify = true): Promise<boolean> => {
        if (!view) return Promise.resolve(true); // nothing loaded — nothing to persist
        const v = view; // stable handle for the callbacks below
        const content = v.state.doc.toString(); // captured now, written later
        const op = writeChain.then(() =>
          api.writeFile(filePath, content).then(
            () => {
              // Only clear the dirty dot if the doc has not moved on mid-write.
              if (v.state.doc.toString() === content) {
                setDirty(false);
                dirtyRef.current = false;
              }
              if (notify) savedRef.current(filePath); // auto-compile on save (M3)
              if (filePath.endsWith(".bib") || filePath.endsWith(".rbib")) {
                const root = ctx.projectRoot;
                if (root) void bibIndex.refresh(root, true); // fresh keys for \citep{…}
              }
              return true;
            },
            (e: unknown) => {
              setError(e instanceof Error ? e.message : String(e));
              return false;
            },
          ),
        );
        writeChain = op.then((): undefined => undefined, (): undefined => undefined);
        return op;
      };
      saveRef.current = save;
      const scheduleAutoSave = () => {
        if (autoTimer != null) window.clearTimeout(autoTimer);
        autoTimer = window.setTimeout(() => {
          autoTimer = null;
          void save(); // same semantics as a manual save (auto-compile coalesces)
        }, AUTO_SAVE_MS);
      };
      const tabSize = typeof settings.tabSize === "number" ? settings.tabSize : 4;
      const wrap = !!settings.wrap;
      view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: r.content,
          extensions: [
            history(),
            // activateOnCompletion re-queries after a pick — that is what makes
            // \begin cascade into the environment-name picker (issue 23).
            autocompletion({ activateOnCompletion: reOpenEnvPicker, icons: false }),
            highlightSelectionMatches(),
            bracketMatching(),
            syntaxHighlighting(vesperHighlight),
            drawSelection(),
            spellDecoField,
            spellcheckPlugin({
              getEnabled: () => spellRef.current.enabled,
              getLang: () => spellRef.current.lang,
              onStatus: setSpellStatus,
            }),
            vesperChrome,
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              ...completionKeymap,
              // Tab accepts the open completion (Overleaf behavior); with no
              // overlay showing it falls through to indentation below.
              { key: "Tab", run: acceptCompletion },
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
              if (u.docChanged) {
                setDirty(true);
                dirtyRef.current = true;
                scheduleAutoSave(); // autosave: disk follows the last keystroke
              }
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
      if (autoTimer != null) window.clearTimeout(autoTimer);
      // Closing or switching away must not silently discard unsaved edits —
      // flush them (chained after any in-flight write) before the view goes.
      const flush = dirtyRef.current ? saveRef.current() : null;
      view?.destroy();
      if (viewRef.current === view) viewRef.current = null;
      setDirty(false);
      dirtyRef.current = false;
      void flush;
    };
    // tabSize/wrap recreate the view; fontSize/lineHeight are live CSS vars.
    // projectRoot: switching projects must reload even for identical file names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, ctx.projectRoot, settings.tabSize, settings.wrap]);

  // The spell-check plugin reads its settings through getters but only on a
  // transaction — force one when they change so toggles apply live (issue 24).
  useEffect(() => {
    const v = viewRef.current;
    if (v) v.dispatch({});
  }, [settings.spellcheck, settings.spellLang]);

  // Keep the citation index loaded for the open project — \citep{…} lists its
  // keys; per-file saves force a re-read (see the save callback above).
  useEffect(() => {
    if (ctx.projectRoot) void bibIndex.refresh(ctx.projectRoot);
  }, [ctx.projectRoot]);

  // Register this tab's save so Compile can persist open edits before building
  // — a compile reads from disk, unsaved changes would otherwise be lost (M3).
  const registerEditorSave = ctx.registerEditorSave;
  useEffect(() => {
    if (!filePath) return;
    let alive = true;
    const unregister = registerEditorSave(filePath, {
      get dirty() {
        return alive && dirtyRef.current;
      },
      run: () => (alive && dirtyRef.current ? saveRef.current(false) : Promise.resolve(true)),
      flush: () => {
        if (!alive || !dirtyRef.current) return; // nothing pending
        const v = viewRef.current;
        if (!v) return;
        // Claim the write first: both teardown events fire, and a keepalive
        // request cannot report success back before the page is gone.
        dirtyRef.current = false;
        setDirty(false);
        api.flushFile(filePath, v.state.doc.toString());
      },
    });
    return () => {
      alive = false;
      unregister();
    };
  }, [filePath, registerEditorSave]);

  // Inverse search (M3): PDF click → jump to the line. Re-runs on
  // viewTick because the view is created asynchronously after a load.
  useEffect(() => {
    const g = ctx.editorGoto;
    if (!g || !filePath || g.file !== filePath) return;
    const view = viewRef.current;
    if (view) applyGoto(view, g.line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.editorGoto, filePath, viewTick]);

  // The compile controls are LaTeX-only: shown when this tab is a .tex file.
  const isTex = !!filePath && filePath.endsWith(".tex");
  // The Format action is bibliography-only: parse → canonical re-emit, the
  // same "pretty-print" logic as the JSON view (one undoable change; autosave
  // persists it). No-op when the document is already canonical.
  const isBib = !!filePath && (filePath.endsWith(".bib") || filePath.endsWith(".rbib"));
  const formatBibDoc = () => {
    const v = viewRef.current;
    if (!v || !isBib) return;
    const src = v.state.doc.toString();
    const out = formatBib(src);
    if (out === src) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: out } });
  };

  // Keep the picker valid and defaulted to the project's main file.
  useEffect(() => {
    if (!isTex) return;
    const files = ctx.texFiles ?? [];
    if (pick && files.includes(pick)) return;
    const main = ctx.project?.main_file ?? "";
    setPick(files.includes(main) ? main : files[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTex, ctx.texFiles, ctx.project?.main_file]);

  const jobRunning = !!ctx.job && ctx.job.status === "running";

  const fs = typeof settings.fontSize === "number" ? settings.fontSize : 15;
  const lh = typeof settings.lineHeight === "number" ? settings.lineHeight : 1.7;
  // Cursor shape + smooth motion apply live via data attributes (no view recreation).
  const cursorType = typeof settings.cursorType === "string" ? settings.cursorType : "line";
  const cursorLineWidth = typeof settings.cursorLineWidth === "number" ? settings.cursorLineWidth : 1.2;
  const smoothCursor = !!settings.smoothCursor;
  const spellOn = !!settings.spellcheck;

  return (
    <div
      className="editor-pane"
      data-cursor={cursorType}
      data-smooth={smoothCursor ? "on" : "off"}
      style={
        { "--cm-fs": `${fs}px`, "--cm-lh": String(lh), "--cm-cursor-w": `${cursorLineWidth}px` } as React.CSSProperties
      }
    >
      <div className="pane-header">
        <span>{filePath ?? "no file selected"}</span>
        <span className={"dot" + (dirty ? " dirty" : "")} title={dirty ? "unsaved changes" : "saved"} />
        {spellOn && spellStatus === "loading" && (
          <span className="spell-status">dictionary…</span>
        )}
        {spellOn && spellStatus === "error" && (
          <span className="spell-status err" title="Dictionary download failed — check the connection and try again">
            dictionary failed
          </span>
        )}
        {filePath && (
          <button className="mini" onClick={() => saveRef.current()} disabled={!dirty}>
            Save
          </button>
        )}
        {isBib && (
          <button className="mini" onClick={formatBibDoc} title="Pretty-print the bibliography (canonical format)">
            Format
          </button>
        )}
        <span className="head-spacer" />
        {isTex && ctx.projectOpen && (
          <span className="compile-pick">
            <span>Compile</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              title="Which .tex file the Compile button builds"
            >
              {(ctx.texFiles ?? []).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {jobRunning ? (
              <button className="danger" onClick={() => ctx.onCancelJob()}>Cancel</button>
            ) : (
              <button
                className="primary"
                title="Saves open edits, then compiles"
                onClick={() => pick && ctx.onCompileFile(pick)}
                disabled={!pick}
              >
                Compile
              </button>
            )}
          </span>
        )}
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