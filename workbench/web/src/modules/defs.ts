// Module metadata without React: shared by the layout reducer and the UI.
import type { AreaId } from "./layout";

export interface ModuleDef {
  id: string;
  title: string;
  defaultArea: AreaId;
  singleton: boolean;
  /** Tab id for a given param set (editor tabs are keyed by file path). */
  tabId: (params?: Record<string, unknown>) => string;
}

export const MODULE_DEFS: Record<string, ModuleDef> = {
  explorer: {
    id: "explorer",
    title: "Explorer",
    defaultArea: "sidebar",
    singleton: true,
    tabId: () => "explorer",
  },
  editor: {
    id: "editor",
    title: "Editor",
    defaultArea: "center",
    singleton: false,
    tabId: (p) => (p?.filePath ? `editor:${String(p.filePath)}` : "editor"),
  },
  pdf: {
    id: "pdf",
    title: "PDF Preview",
    defaultArea: "right",
    singleton: true,
    tabId: () => "pdf",
  },
  log: {
    id: "log",
    title: "Run Log",
    defaultArea: "panel",
    singleton: true,
    tabId: () => "log",
  },
  install: {
    id: "install",
    title: "Install TeX",
    defaultArea: "right",
    singleton: true,
    tabId: () => "install",
  },
};

/** Activity bar order. */
export const MODULE_ORDER = ["explorer", "editor", "pdf", "log", "install"];
