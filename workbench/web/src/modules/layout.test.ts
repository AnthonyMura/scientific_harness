// Reducer tests for tab reordering (issue 53): the "move" action re-inserts a
// tab at an index within its group — clamped, active preserved — and the new
// order survives a persistLayout/loadPersistedLayout round-trip.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultLayout, layoutReducer, loadPersistedLayout, persistLayout } from "./layout";
import type { LayoutState } from "./layout";

/** Minimal localStorage stand-in for the node test environment. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

let storage: MemoryStorage;
let prevStorage: unknown;

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  prevStorage = g.localStorage;
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  if (prevStorage === undefined) delete g.localStorage;
  else Object.defineProperty(globalThis, "localStorage", { value: prevStorage, configurable: true });
});

/** Editor (main.tex) + PDF in the same group: [editor:main.tex, pdf]. */
function twoTabs(): LayoutState {
  let s = defaultLayout();
  s = layoutReducer(s, { type: "open", moduleId: "editor", params: { filePath: "main.tex" } });
  s = layoutReducer(s, { type: "open", moduleId: "pdf", groupId: "g-editor" });
  return s;
}

function group(s: LayoutState, id: string): { tabs: string[]; active: string | null } {
  const n = s.nodes[id];
  if (!n || n.kind !== "group") throw new Error("not a group: " + id);
  return { tabs: n.tabs, active: n.active };
}

describe("move within a group (issue 53)", () => {
  it("moves a tab right past its neighbour and keeps it active", () => {
    const s = layoutReducer(twoTabs(), { type: "move", tabId: "editor:main.tex", groupId: "g-editor", index: 1 });
    expect(group(s, "g-editor").tabs).toEqual(["pdf", "editor:main.tex"]);
    expect(group(s, "g-editor").active).toBe("editor:main.tex");
  });

  it("moves a tab left past its neighbour and keeps it active", () => {
    const s = layoutReducer(twoTabs(), { type: "move", tabId: "pdf", groupId: "g-editor", index: 0 });
    expect(group(s, "g-editor").tabs).toEqual(["pdf", "editor:main.tex"]);
    expect(group(s, "g-editor").active).toBe("pdf");
  });

  it("clamps out-of-range indices to the strip ends", () => {
    const first = layoutReducer(twoTabs(), { type: "move", tabId: "editor:main.tex", groupId: "g-editor", index: -5 });
    expect(group(first, "g-editor").tabs).toEqual(["editor:main.tex", "pdf"]);
    const last = layoutReducer(twoTabs(), { type: "move", tabId: "pdf", groupId: "g-editor", index: 99 });
    expect(group(last, "g-editor").tabs).toEqual(["editor:main.tex", "pdf"]);
  });

  it("moves a middle tab to start and end in a three-tab strip", () => {
    let s = twoTabs();
    s = layoutReducer(s, { type: "open", moduleId: "editor", params: { filePath: "ch1.tex" }, groupId: "g-editor" });
    expect(group(s, "g-editor").tabs).toEqual(["editor:main.tex", "pdf", "editor:ch1.tex"]);
    const toStart = layoutReducer(s, { type: "move", tabId: "editor:ch1.tex", groupId: "g-editor", index: 0 });
    expect(group(toStart, "g-editor").tabs).toEqual(["editor:ch1.tex", "editor:main.tex", "pdf"]);
    const toEnd = layoutReducer(s, { type: "move", tabId: "editor:main.tex", groupId: "g-editor", index: 2 });
    expect(group(toEnd, "g-editor").tabs).toEqual(["pdf", "editor:ch1.tex", "editor:main.tex"]);
  });

  it("keeps the moved editor tab as lastEditor and focuses its group", () => {
    const s = layoutReducer(twoTabs(), { type: "move", tabId: "editor:main.tex", groupId: "g-editor", index: 1 });
    expect(s.lastEditor).toBe("editor:main.tex");
    expect(s.focusedGroup).toBe("g-editor");
  });

  it("still moves a tab between groups, leaving the source group behind", () => {
    const s = layoutReducer(twoTabs(), { type: "move", tabId: "pdf", groupId: "g-panel" });
    expect(group(s, "g-editor").tabs).toEqual(["editor:main.tex"]);
    expect(group(s, "g-panel").tabs).toEqual(["pdf"]);
  });

  it("persists the new order through a persistLayout/loadPersistedLayout round-trip", () => {
    const moved = layoutReducer(twoTabs(), { type: "move", tabId: "editor:main.tex", groupId: "g-editor", index: 1 });
    persistLayout(moved, null);
    const loaded = loadPersistedLayout();
    expect(group(loaded.state, "g-editor").tabs).toEqual(["pdf", "editor:main.tex"]);
    expect(group(loaded.state, "g-editor").active).toBe("editor:main.tex");
  });
});
