// VSCode-style layout engine: a tree of groups and splits. A group holds an
// ordered list of tabs; a split lays its two children out horizontally ("h")
// or vertically ("v"). Any group can be split, any tab can live in any group,
// and the whole geometry persists to localStorage.
import { MODULE_DEFS } from "./defs";

export const FILE_DRAG_MIME = "application/x-workbench-file";
export const TAB_DRAG_MIME = "application/x-workbench-tab";
/** Activity-bar module drag: open/move a module into the hovered pane. */
export const MODULE_DRAG_MIME = "application/x-workbench-module";

export interface Tab {
  id: string;
  moduleId: string;
  title: string;
  params?: Record<string, unknown>;
}

export type GroupNode = { id: string; kind: "group"; tabs: string[]; active: string | null };
export type SplitNode = { id: string; kind: "split"; dir: "h" | "v"; a: string; b: string; ratio: number };
export type Node = GroupNode | SplitNode;

export interface LayoutState {
  nodes: Record<string, Node>;
  rootId: string;
  tabs: Record<string, Tab>;
  /** Last group each module's tab lived in — where the activity bar reopens it. */
  homes: Record<string, string>;
  focusedGroup: string | null;
  /** Most recently active editor tab (drives the explorer's "active file"). */
  lastEditor: string | null;
  fullscreen: string | null;
}

export type LayoutAction =
  | { type: "open"; moduleId: string; params?: Record<string, unknown>; groupId?: string }
  | { type: "activate"; groupId: string; tabId: string }
  | { type: "focus"; groupId: string }
  | { type: "close"; tabId: string }
  | { type: "move"; tabId: string; groupId: string; index?: number }
  /** side "before" puts the new pane left/top of the group, "after" right/bottom. */
  | { type: "split"; groupId: string; dir: "h" | "v"; side?: "before" | "after"; withTabId?: string; withModuleId?: string }
  | { type: "removeGroup"; groupId: string }
  | { type: "resize"; splitId: string; ratio: number }
  | { type: "fullscreen"; nodeId: string | null }
  | { type: "retab"; oldId: string; newId: string; title?: string }
  | { type: "resetTabs" }
  | { type: "resetLayout" };

/** Fixed group ids of the default template (one per slot). */
export const SLOT_GROUPS = { sidebar: "g-sidebar", editor: "g-editor", panel: "g-panel" } as const;

let seq = 0;
const nid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Default template, VSCode-style: a bottom panel strip below the main row of
 * [sidebar | editor]. The panel starts empty — drop Run Log / PDF there or
 * remove it with the × on its header.
 */
export function defaultLayout(): LayoutState {
  return {
    nodes: {
      "g-sidebar": { id: "g-sidebar", kind: "group", tabs: [], active: null },
      "g-editor": { id: "g-editor", kind: "group", tabs: [], active: null },
      "g-panel": { id: "g-panel", kind: "group", tabs: [], active: null },
      "s-row": { id: "s-row", kind: "split", dir: "h", a: "g-sidebar", b: "g-editor", ratio: 0.2 },
      "s-root": { id: "s-root", kind: "split", dir: "v", a: "s-row", b: "g-panel", ratio: 0.82 },
    },
    rootId: "s-root",
    tabs: {},
    homes: {},
    focusedGroup: "g-editor",
    lastEditor: null,
    fullscreen: null,
  };
}

const isGroup = (n: Node | undefined): n is GroupNode => !!n && n.kind === "group";

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec };
  delete next[key];
  return next;
}

function groupOfTab(state: LayoutState, tabId: string): string | null {
  for (const n of Object.values(state.nodes)) if (isGroup(n) && n.tabs.includes(tabId)) return n.id;
  return null;
}

/** Parent split of a node id (depth-first from the root), or null. */
function findParent(
  nodes: Record<string, Node>,
  rootId: string,
  id: string,
): { split: SplitNode; which: "a" | "b" } | null {
  const seen = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = nodes[cur];
    if (!n || n.kind !== "split") continue;
    if (n.a === id) return { split: n, which: "a" };
    if (n.b === id) return { split: n, which: "b" };
    stack.push(n.a, n.b);
  }
  return null;
}

/** Does the subtree rooted at id contain the given group? */
function containsGroup(nodes: Record<string, Node>, id: string, groupId: string): boolean {
  const seen = new Set<string>();
  const stack: string[] = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = nodes[cur];
    if (!n) continue;
    if (n.kind === "group") {
      if (cur === groupId) return true;
      continue;
    }
    stack.push(n.a, n.b);
  }
  return false;
}

/** Splits on the path from the root down to (not including) a group. */
export function pathToGroup(
  nodes: Record<string, Node>,
  rootId: string,
  groupId: string,
): { split: SplitNode; which: "a" | "b" }[] | null {
  const chain: { split: SplitNode; which: "a" | "b" }[] = [];
  let cur: string | null = rootId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return null; // cycle guard
    seen.add(cur);
    const n: Node | undefined = nodes[cur];
    if (!n) return null;
    if (n.kind === "group") return cur === groupId ? chain : null;
    if (containsGroup(nodes, n.a, groupId)) {
      chain.push({ split: n, which: "a" });
      cur = n.a;
    } else if (containsGroup(nodes, n.b, groupId)) {
      chain.push({ split: n, which: "b" });
      cur = n.b;
    } else {
      return null;
    }
  }
  return null;
}

/** First group in depth-first order from the root. */
function firstGroupId(state: LayoutState): string | null {
  const seen = new Set<string>();
  const stack: string[] = [state.rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = state.nodes[cur];
    if (!n) continue;
    if (isGroup(n)) return n.id;
    stack.push(n.b, n.a); // push b first so a is visited first
  }
  return null;
}

function setGroupActive(nodes: Record<string, Node>, groupId: string, tabId: string | null): Record<string, Node> {
  const g = nodes[groupId];
  if (!isGroup(g)) return nodes;
  return { ...nodes, [groupId]: { ...g, active: tabId } };
}

function insertTabAt(nodes: Record<string, Node>, groupId: string, tabId: string, index?: number): Record<string, Node> {
  const g = nodes[groupId];
  if (!isGroup(g)) return nodes;
  const tabs = g.tabs.filter((t) => t !== tabId);
  const i = index === undefined ? tabs.length : Math.max(0, Math.min(index, tabs.length));
  tabs.splice(i, 0, tabId);
  return { ...nodes, [groupId]: { ...g, tabs } };
}

function removeTab(nodes: Record<string, Node>, groupId: string, tabId: string): Record<string, Node> {
  const g = nodes[groupId];
  if (!isGroup(g) || !g.tabs.includes(tabId)) return nodes;
  const idx = g.tabs.indexOf(tabId);
  const tabs = g.tabs.filter((t) => t !== tabId);
  const active = g.active === tabId ? (tabs[Math.min(idx, tabs.length - 1)] ?? null) : g.active;
  return { ...nodes, [groupId]: { ...g, tabs, active } };
}

/** Where a freshly opened module lands: explicit group > remembered home > slot group. */
function openTargetGroup(state: LayoutState, moduleId: string, explicit?: string): string | null {
  const def = MODULE_DEFS[moduleId];
  if (!def) return null;
  if (explicit && isGroup(state.nodes[explicit])) return explicit;
  const home = state.homes[moduleId];
  if (home && isGroup(state.nodes[home])) return home;
  const slot = SLOT_GROUPS[def.slot];
  if (isGroup(state.nodes[slot])) return slot;
  if (isGroup(state.nodes["g-editor"])) return "g-editor";
  return firstGroupId(state);
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case "open": {
      const def = MODULE_DEFS[action.moduleId];
      if (!def) return state;
      const id = def.tabId(action.params);
      if (state.tabs[id]) {
        const g = groupOfTab(state, id);
        if (!g) return state;
        return {
          ...state,
          nodes: setGroupActive(state.nodes, g, id),
          focusedGroup: g,
          lastEditor: def.id === "editor" ? id : state.lastEditor,
        };
      }
      const fp = action.params?.filePath ? String(action.params.filePath) : null;
      const tab: Tab = {
        id,
        moduleId: def.id,
        title: fp ? fp.split("/").pop() || def.title : def.title,
        params: action.params,
      };
      const g = openTargetGroup(state, def.id, action.groupId);
      if (!g) return state;
      const nodes = setGroupActive(insertTabAt(state.nodes, g, id), g, id);
      return {
        ...state,
        tabs: { ...state.tabs, [id]: tab },
        nodes,
        focusedGroup: g,
        homes: { ...state.homes, [def.id]: g },
        lastEditor: def.id === "editor" ? id : state.lastEditor,
      };
    }

    case "activate": {
      const g = state.nodes[action.groupId];
      if (!isGroup(g) || !g.tabs.includes(action.tabId)) return state;
      const t = state.tabs[action.tabId];
      return {
        ...state,
        nodes: setGroupActive(state.nodes, action.groupId, action.tabId),
        focusedGroup: action.groupId,
        lastEditor: t?.moduleId === "editor" ? action.tabId : state.lastEditor,
      };
    }

    case "focus": {
      if (!isGroup(state.nodes[action.groupId])) return state;
      return { ...state, focusedGroup: action.groupId };
    }

    case "close": {
      const g = groupOfTab(state, action.tabId);
      if (!g) return state;
      return {
        ...state,
        tabs: omit(state.tabs, action.tabId),
        nodes: removeTab(state.nodes, g, action.tabId),
        lastEditor: state.lastEditor === action.tabId ? null : state.lastEditor,
      };
    }

    case "move": {
      const tab = state.tabs[action.tabId];
      if (!tab || !isGroup(state.nodes[action.groupId])) return state;
      const from = groupOfTab(state, action.tabId);
      let nodes = state.nodes;
      if (from && from !== action.groupId) nodes = removeTab(nodes, from, action.tabId);
      nodes = insertTabAt(nodes, action.groupId, action.tabId, action.index);
      nodes = setGroupActive(nodes, action.groupId, action.tabId);
      return {
        ...state,
        nodes,
        focusedGroup: action.groupId,
        homes: { ...state.homes, [tab.moduleId]: action.groupId },
        lastEditor: tab.moduleId === "editor" ? action.tabId : state.lastEditor,
      };
    }

    case "split": {
      const g = state.nodes[action.groupId];
      if (!isGroup(g)) return state;
      const newGroup: GroupNode = { id: nid("g-"), kind: "group", tabs: [], active: null };
      const before = action.side === "before";
      const split: SplitNode = {
        id: nid("s-"),
        kind: "split",
        dir: action.dir,
        a: before ? newGroup.id : action.groupId,
        b: before ? action.groupId : newGroup.id,
        ratio: 0.5,
      };
      let nodes: Record<string, Node>;
      let rootId: string;
      if (action.groupId === state.rootId) {
        nodes = { ...state.nodes, [split.id]: split, [newGroup.id]: newGroup };
        rootId = split.id;
      } else {
        const p = findParent(state.nodes, state.rootId, action.groupId);
        if (!p) return state;
        nodes = {
          ...state.nodes,
          [split.id]: split,
          [newGroup.id]: newGroup,
          [p.split.id]: { ...p.split, [p.which]: split.id },
        };
        rootId = state.rootId;
      }
      let next: LayoutState = { ...state, nodes, rootId, focusedGroup: newGroup.id };
      if (action.withTabId && next.tabs[action.withTabId]) {
        const tabId = action.withTabId;
        const from = groupOfTab(next, tabId);
        let n2 = next.nodes;
        if (from) n2 = removeTab(n2, from, tabId);
        n2 = insertTabAt(n2, newGroup.id, tabId, 0);
        n2 = setGroupActive(n2, newGroup.id, tabId);
        const t = next.tabs[tabId];
        next = {
          ...next,
          nodes: n2,
          homes: { ...next.homes, [t.moduleId]: newGroup.id },
          lastEditor: t.moduleId === "editor" ? tabId : next.lastEditor,
        };
      }
      // A module dragged from the activity bar lands in the fresh pane.
      if (action.withModuleId) {
        const def = MODULE_DEFS[action.withModuleId];
        if (def) {
          const id = def.tabId();
          next = next.tabs[id]
            ? layoutReducer(next, { type: "move", tabId: id, groupId: newGroup.id })
            : layoutReducer(next, { type: "open", moduleId: action.withModuleId, groupId: newGroup.id });
        }
      }
      return next;
    }

    case "removeGroup": {
      const g = state.nodes[action.groupId];
      if (!isGroup(g) || g.tabs.length > 0 || action.groupId === state.rootId) return state;
      const p = findParent(state.nodes, state.rootId, action.groupId);
      if (!p) return state;
      const siblingId = p.split.a === action.groupId ? p.split.b : p.split.a;
      const sibling = state.nodes[siblingId];
      if (!sibling) return state;
      let nodes = { ...state.nodes };
      delete nodes[action.groupId];
      delete nodes[p.split.id];
      let rootId = state.rootId;
      if (p.split.id === rootId) {
        rootId = siblingId;
      } else {
        const gp = findParent(nodes, rootId, p.split.id);
        if (!gp) return state;
        nodes[gp.split.id] = { ...gp.split, [gp.which]: siblingId };
      }
      return { ...state, nodes, rootId, focusedGroup: isGroup(nodes[siblingId]) ? siblingId : null };
    }

    case "resize": {
      const n = state.nodes[action.splitId];
      if (!n || n.kind !== "split") return state;
      const ratio = Math.min(0.85, Math.max(0.15, action.ratio));
      return { ...state, nodes: { ...state.nodes, [n.id]: { ...n, ratio } } };
    }

    case "fullscreen":
      return { ...state, fullscreen: action.nodeId };

    case "retab": {
      if (!state.tabs[action.oldId] || state.tabs[action.newId]) return state;
      const old = state.tabs[action.oldId];
      const tabs: Record<string, Tab> = {
        ...state.tabs,
        [action.newId]: { ...old, id: action.newId, title: action.title ?? old.title },
      };
      delete tabs[action.oldId];
      const nodes: Record<string, Node> = {};
      for (const n of Object.values(state.nodes)) {
        if (n.kind === "group") {
          nodes[n.id] = {
            ...n,
            tabs: n.tabs.map((t) => (t === action.oldId ? action.newId : t)),
            active: n.active === action.oldId ? action.newId : n.active,
          };
        } else {
          nodes[n.id] = n;
        }
      }
      return {
        ...state,
        tabs,
        nodes,
        lastEditor: state.lastEditor === action.oldId ? action.newId : state.lastEditor,
      };
    }

    case "resetTabs": {
      const fg = isGroup(state.nodes["g-editor"]) ? "g-editor" : firstGroupId(state);
      return { ...state, tabs: {}, focusedGroup: fg, lastEditor: null, fullscreen: null };
    }

    case "resetLayout":
      return defaultLayout();

    default:
      return state;
  }
}

// --- persistence -------------------------------------------------------------

const KEY = "workbench.layout.v3";

export function persistLayout(state: LayoutState, root: string | null): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        root,
        nodes: state.nodes,
        rootId: state.rootId,
        tabs: state.tabs,
        homes: state.homes,
        focusedGroup: state.focusedGroup,
        lastEditor: state.lastEditor,
      }),
    );
  } catch {
    // storage unavailable — layout simply will not persist
  }
}

function validate(nodes: Record<string, Node>, rootId: string, tabs: Record<string, Tab>): boolean {
  if (!nodes[rootId]) return false;
  const seen = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) return false; // cycle
    seen.add(id);
    const n = nodes[id];
    if (!n || typeof n !== "object") return false;
    if (n.kind === "group") {
      if (!Array.isArray(n.tabs)) return false;
      for (const t of n.tabs) if (!tabs[t]) return false;
      if (n.active !== null && !tabs[n.active]) return false;
    } else if (n.kind === "split") {
      if (n.dir !== "h" && n.dir !== "v") return false;
      if (typeof n.ratio !== "number" || !(n.ratio > 0.1 && n.ratio < 0.9)) return false;
      stack.push(n.a, n.b);
    } else {
      return false;
    }
  }
  return true;
}

export function loadPersistedLayout(): { state: LayoutState; root: string | null } {
  const fallback = { state: defaultLayout(), root: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const nodes = p.nodes as Record<string, Node> | undefined;
    const rootId = p.rootId as string | undefined;
    const tabs = (p.tabs ?? {}) as Record<string, Tab>;
    if (!nodes || !rootId || !validate(nodes, rootId, tabs)) return fallback;
    const homes = { ...(p.homes ?? {}) as Record<string, string> };
    for (const k of Object.keys(homes)) if (!isGroup(nodes[homes[k]])) delete homes[k];
    const fg = p.focusedGroup as string | undefined;
    const le = p.lastEditor as string | undefined;
    return {
      state: {
        nodes,
        rootId,
        tabs,
        homes,
        focusedGroup: fg && isGroup(nodes[fg]) ? fg : null,
        lastEditor: le && tabs[le] ? le : null,
        fullscreen: null,
      },
      root: typeof p.root === "string" ? p.root : null,
    };
  } catch {
    return fallback;
  }
}
