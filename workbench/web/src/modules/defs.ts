// Module metadata without React: shared by the layout reducer and the UI.
export type Slot = "sidebar" | "editor" | "panel";

export interface ModuleDef {
  id: string;
  title: string;
  /** Where a freshly opened module lands if the user has not placed it yet. */
  slot: Slot;
  /** Tab id for a given param set (editor tabs are keyed by file path). */
  tabId: (params?: Record<string, unknown>) => string;
}

export const MODULE_DEFS: Record<string, ModuleDef> = {
  explorer: { id: "explorer", title: "Explorer", slot: "sidebar", tabId: () => "explorer" },
  structure: { id: "structure", title: "Structure", slot: "sidebar", tabId: () => "structure" },
  editor: {
    id: "editor",
    title: "Editor",
    slot: "editor",
    tabId: (p) => (p?.filePath ? `editor:${String(p.filePath)}` : "editor"),
  },
  pdf: { id: "pdf", title: "PDF Preview", slot: "panel", tabId: () => "pdf" },
  log: { id: "log", title: "Run Log", slot: "panel", tabId: () => "log" },
  install: { id: "install", title: "Install TeX", slot: "panel", tabId: () => "install" },
};

/** Activity bar order. */
export const MODULE_ORDER = ["explorer", "structure", "editor", "pdf", "log", "install"];
