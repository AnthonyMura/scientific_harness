// Editor module: CodeMirror with the Vesper palette. Font size and line height
// apply live via CSS vars; tab size / word wrap recreate the view.
import React, { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
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
];
export const EDITOR_DEFAULTS: ModuleSettings = { fontSize: 15, lineHeight: 1.7, tabSize: 4, wrap: false };

interface Props {
  ctx: AppCtx;
  filePath: string | null;
}

export default function EditorPane({ ctx, filePath }: Props) {
  const [settings, setSetting] = useModuleSettings("editor", EDITOR_DEFAULTS);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!filePath || !hostRef.current) return;
    let cancelled = false;
    let view: EditorView | null = null;
    (async () => {
      const r = await api.readFile(filePath);
      if (cancelled || !hostRef.current) return;
      const lang = filePath.endsWith(".md")
        ? [markdown()]
        : filePath.endsWith(".tex")
          ? [latexLanguage]
          : []; // any other file type opens as plain text
      const save = () => {
        if (!view) return;
        void api
          .writeFile(filePath, view.state.doc.toString())
          .then(() => setDirty(false))
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
            EditorState.tabSize.of(tabSize),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(true);
            }),
          ],
        }),
      });
      viewRef.current = view;
      setError(null);
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

  const fs = typeof settings.fontSize === "number" ? settings.fontSize : 15;
  const lh = typeof settings.lineHeight === "number" ? settings.lineHeight : 1.7;

  return (
    <div className="editor-pane" style={{ "--cm-fs": `${fs}px`, "--cm-lh": String(lh) } as React.CSSProperties}>
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
        <div className="pane-empty">No file selected — pick one in the Explorer, or open a new project.</div>
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
