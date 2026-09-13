// Layout state for the module workbench: tabs, areas, sizes, fullscreen.
// Geometry + open tabs persist to localStorage (VSCode-style workspace layout).
import { MODULE_DEFS } from "./defs";

export type AreaId = "sidebar" | "center" | "right" | "panel";
export const AREAS: AreaId[] = ["sidebar", "center", "right", "panel"];
export const AREA_LABELS: Record<AreaId, string> = {
  sidebar: "Sidebar",
  center: "Center",
  right: "Right",
  panel: "Bottom Panel",
};

/** dataTransfer type for dragging a project file from the explorer into the workbench. */
export const FILE_DRAG_MIME = "application/x-workbench-file";

export interface Tab {
  id: string;
  moduleId: string;
  title: string;
  params?: Record<string, unknown>;
}

export interface LayoutState {
  tabs: Record<string, Tab>;
  areas: Record<AreaId, string[]>;
  active: Partial<Record<AreaId, string>>;
  widths: { sidebar: number; right: number; panel: number };
  collapsed: { sidebar: boolean; right: boolean; panel: boolean };
  fullscreen: AreaId | null;
}

export type LayoutAction =
  | { type: "open"; moduleId: string; params?: Record<string, unknown> }
  | { type: "activate"; area: AreaId; tabId: string }
  | { type: "close"; tabId: string }
  | { type: "move"; tabId: string; toArea: AreaId; index?: number }
  | { type: "resize"; key: "sidebar" | "right" | "panel"; value: number }
  | { type: "collapse"; area: Exclude<AreaId, "center">; value?: boolean }
  | { type: "fullscreen"; area: AreaId | null }
  | { type: "retab"; oldId: string; newId: string; title?: string }
  | { type: "resetTabs" };

export const DEFAULT_WIDTHS = { sidebar: 240, right: 380, panel: 200 };

const MIN_MAX: Record<"sidebar" | "right" | "panel", [number, number]> = {
  sidebar: [160, 480],
  right: [240, 720],
  panel: [90, 520],
};

export function clampWidth(key: "sidebar" | "right" | "panel", value: number): number {
  const [lo, hi] = MIN_MAX[key];
  if (!Number.isFinite(value)) return DEFAULT_WIDTHS[key];
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function emptyTabs(): Pick<LayoutState, "tabs" | "areas" | "active"> {
  return {
    tabs: {},
    areas: { sidebar: [], center: [], right: [], panel: [] },
    active: {},
  };
}

export function defaultLayout(): LayoutState {
  return {
    ...emptyTabs(),
    widths: { ...DEFAULT_WIDTHS },
    collapsed: { sidebar: false, right: true, panel: true },
    fullscreen: null,
  };
}

function areaOf(state: LayoutState, tabId: string): AreaId | null {
  for (const a of AREAS) if (state.areas[a].includes(tabId)) return a;
  return null;
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case "open": {
      const def = MODULE_DEFS[action.moduleId];
      if (!def) return state;
      const id = def.tabId(action.params);
      if (state.tabs[id]) {
        const area = areaOf(state, id);
        if (!area) return state;
        return {
          ...state,
          active: { ...state.active, [area]: id },
          collapsed: { ...state.collapsed, [area]: false },
        };
      }
      const fp = action.params?.filePath ? String(action.params.filePath) : null;
      const tab: Tab = {
        id,
        moduleId: def.id,
        title: fp ? (fp.split("/").pop() || def.title) : def.title,
        params: action.params,
      };
      const area = def.defaultArea;
      return {
        ...state,
        tabs: { ...state.tabs, [id]: tab },
        areas: { ...state.areas, [area]: [...state.areas[area], id] },
        active: { ...state.active, [area]: id },
        collapsed: area === "center" ? state.collapsed : { ...state.collapsed, [area]: false },
      };
    }
    case "activate": {
      if (!state.areas[action.area].includes(action.tabId)) return state;
      return { ...state, active: { ...state.active, [action.area]: action.tabId } };
    }
    case "close": {
      const area = areaOf(state, action.tabId);
      if (!area) return state;
      const list = state.areas[area].filter((t) => t !== action.tabId);
      const tabs = { ...state.tabs };
      delete tabs[action.tabId];
      const active = { ...state.active };
      if (active[area] === action.tabId) {
        const idx = state.areas[area].indexOf(action.tabId);
        const next = list[Math.min(idx, list.length - 1)];
        if (next) active[area] = next;
        else delete active[area];
      }
      return { ...state, tabs, areas: { ...state.areas, [area]: list }, active };
    }
    case "move": {
      const from = areaOf(state, action.tabId);
      if (!from || !state.tabs[action.tabId]) return state;
      const to = action.toArea;
      const targetList = state.areas[to].filter((t) => t !== action.tabId);
      let insertAt = action.index ?? targetList.length;
      if (from === to) {
        const origIdx = state.areas[to].indexOf(action.tabId);
        if (origIdx !== -1 && origIdx < insertAt) insertAt -= 1;
      }
      insertAt = Math.max(0, Math.min(insertAt, targetList.length));
      targetList.splice(insertAt, 0, action.tabId);
      const areas = { ...state.areas };
      if (from === to) {
        areas[to] = targetList;
      } else {
        areas[from] = state.areas[from].filter((t) => t !== action.tabId);
        areas[to] = targetList;
      }
      const collapsed =
        to === "center" ? state.collapsed : { ...state.collapsed, [to]: false };
      const active = { ...state.active, [to]: action.tabId };
      if (from !== to && state.active[from]) {
        const srcList = areas[from];
        const idx = state.areas[from].indexOf(action.tabId);
        const next = srcList[Math.min(idx, srcList.length - 1)];
        if (next) active[from] = next;
        else delete active[from];
      }
      return { ...state, areas, collapsed, active };
    }
    case "resize":
      return { ...state, widths: { ...state.widths, [action.key]: clampWidth(action.key, action.value) } };
    case "collapse": {
      const value = action.value ?? !state.collapsed[action.area];
      return {
        ...state,
        collapsed: { ...state.collapsed, [action.area]: value },
        fullscreen: state.fullscreen === action.area ? null : state.fullscreen,
      };
    }
    case "fullscreen":
      return { ...state, fullscreen: action.area };
    case "retab": {
      const from = areaOf(state, action.oldId);
      const tab = state.tabs[action.oldId];
      if (!from || !tab) return state;
      const tabs = { ...state.tabs };
      delete tabs[action.oldId];
      tabs[action.newId] = { ...tab, id: action.newId, title: action.title ?? tab.title };
      const areas = {
        ...state.areas,
        [from]: state.areas[from].map((t) => (t === action.oldId ? action.newId : t)),
      };
      const active = { ...state.active };
      if (active[from] === action.oldId) active[from] = action.newId;
      return { ...state, tabs, areas, active };
    }
    case "resetTabs":
      return { ...state, ...emptyTabs(), fullscreen: null };
  }
}

// --- persistence -----------------------------------------------------------

const KEY = "workbench.layout.v2";

export function persistLayout(state: LayoutState, root: string | null): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        root,
        tabs: state.tabs,
        areas: state.areas,
        active: state.active,
        widths: state.widths,
        collapsed: state.collapsed,
      }),
    );
  } catch {
    // storage unavailable — layout is session-only
  }
}

export function loadPersistedLayout(): { state: LayoutState; root: string | null } {
  const base = defaultLayout();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: base, root: null };
    const p = JSON.parse(raw);
    const tabs: Record<string, Tab> = {};
    for (const t of Object.values(p.tabs ?? {}) as Tab[]) {
      const def = t && typeof t.id === "string" ? MODULE_DEFS[t.moduleId] : null;
      if (def && t.id === def.tabId(t.params) && typeof t.title === "string") tabs[t.id] = t;
    }
    const areas: Record<AreaId, string[]> = { sidebar: [], center: [], right: [], panel: [] };
    for (const a of AREAS) {
      const list = Array.isArray(p.areas?.[a]) ? p.areas[a] : [];
      areas[a] = [...new Set(list.filter((id: unknown): id is string => typeof id === "string" && !!tabs[id]))];
    }
    const active: Partial<Record<AreaId, string>> = {};
    for (const a of AREAS) {
      const v = p.active?.[a];
      if (typeof v === "string" && areas[a].includes(v)) active[a] = v;
    }
    const widths = { ...DEFAULT_WIDTHS };
    for (const k of ["sidebar", "right", "panel"] as const) {
      const v = p.widths?.[k];
      if (typeof v === "number") widths[k] = clampWidth(k, v);
    }
    const collapsed = { sidebar: false, right: true, panel: true };
    for (const k of ["sidebar", "right", "panel"] as const) {
      if (typeof p.collapsed?.[k] === "boolean") collapsed[k] = p.collapsed[k];
    }
    return {
      state: { ...base, tabs, areas, active, widths, collapsed },
      root: typeof p.root === "string" ? p.root : null,
    };
  } catch {
    return { state: base, root: null };
  }
}
