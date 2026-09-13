// Module workbench shell: activity bar + a VSCode-style tree of splittable
// groups. Any group can be split horizontally or vertically, any tab can be
// dragged into any group, and dropping near a group's bottom/right edge
// creates a new pane there (the dragged tab lands in the new pane).
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppCtx } from "../modules/ctx";
import { FILE_DRAG_MIME, TAB_DRAG_MIME } from "../modules/layout";
import type { LayoutAction, LayoutState, Tab } from "../modules/layout";
import { MODULE_DEFS, MODULE_ORDER } from "../modules/defs";
import { MODULES } from "../modules/registry";
import { DotsIcon, ExpandIcon, SplitDownIcon, SplitRightIcon, XIcon } from "../icons";

interface DragInfo {
  tabId: string;
  fromGroup: string;
}

type Over =
  | { groupId: string; mode: "insert"; index: number }
  | { groupId: string; mode: "split"; dir: "h" | "v" };

interface WB {
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  ctx: AppCtx;
  drag: DragInfo | null;
  over: Over | null;
  setDrag: (d: DragInfo | null) => void;
  setOver: (o: Over | null) => void;
}

const Ctx = createContext<WB>(null as unknown as WB);
const useWB = () => useContext(Ctx);

/** px from a group's bottom/right edge that triggers "split" instead of insert. */
const EDGE = 26;

function groupOfTab(layout: LayoutState, tabId: string): string | null {
  for (const n of Object.values(layout.nodes)) if (n.kind === "group" && n.tabs.includes(tabId)) return n.id;
  return null;
}

export default function Workbench({
  layout,
  dispatch,
  ctx,
}: {
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  ctx: AppCtx;
}) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [over, setOver] = useState<Over | null>(null);

  // Ctrl+W closes the focused pane's active tab; Esc exits fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layout.fullscreen) {
        dispatch({ type: "fullscreen", nodeId: null });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        const g = layout.focusedGroup ? layout.nodes[layout.focusedGroup] : null;
        if (g && g.kind === "group" && g.active) {
          e.preventDefault();
          dispatch({ type: "close", tabId: g.active });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, dispatch]);

  const wb = useMemo<WB>(
    () => ({ layout, dispatch, ctx, drag, over, setDrag, setOver }),
    [layout, dispatch, ctx, drag, over],
  );
  const rootId = layout.fullscreen ?? layout.rootId;
  if (!layout.nodes[rootId]) return null;

  return (
    <Ctx.Provider value={wb}>
      <div className="wb">
        <ActivityBar />
        <div className="wb-main">
          <NodeView id={rootId} />
          {layout.fullscreen && (
            <button className="fs-exit" title="Exit fullscreen (Esc)" onClick={() => dispatch({ type: "fullscreen", nodeId: null })}>
              <XIcon size={14} />
            </button>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}

function ActivityBar() {
  const { layout, dispatch, ctx } = useWB();
  const openModules = useMemo(() => new Set(Object.values(layout.tabs).map((t) => t.moduleId)), [layout.tabs]);
  const fg = layout.focusedGroup ? layout.nodes[layout.focusedGroup] : null;
  const focusedTab = fg && fg.kind === "group" ? fg.active : null;
  const focusedModule = focusedTab ? layout.tabs[focusedTab]?.moduleId : null;
  return (
    <nav className="activity-bar">
      {MODULE_ORDER.map((id) => {
        const def = MODULE_DEFS[id];
        const Icon = MODULES[id].icon;
        const busy = id === "log" && !!ctx.job && ctx.job.status === "running";
        return (
          <button
            key={id}
            className={"ab-item" + (busy ? " busy" : "") + (focusedModule === id ? " active" : "")}
            title={`${def.title} — ${openModules.has(id) ? "focus its pane" : "open in its home pane"}`}
            onClick={() => dispatch({ type: "open", moduleId: id })}
          >
            {openModules.has(id) && <span className="ab-dot" />}
            <Icon size={19} />
          </button>
        );
      })}
    </nav>
  );
}

function NodeView({ id }: { id: string }) {
  const { layout } = useWB();
  const node = layout.nodes[id];
  if (!node) return null;
  if (node.kind === "group") return <GroupView id={id} />;
  const h = node.dir === "h";
  return (
    <div className={"split " + (h ? "h" : "v")}>
      <div className="split-child" style={h ? { width: `${node.ratio * 100}%` } : { height: `${node.ratio * 100}%` }}>
        <NodeView id={node.a} />
      </div>
      <Divider id={node.id} dir={node.dir} />
      <div className="split-child grow">
        <NodeView id={node.b} />
      </div>
    </div>
  );
}

function Divider({ id, dir }: { id: string; dir: "h" | "v" }) {
  const { dispatch } = useWB();
  const [active, setActive] = useState(false);
  return (
    <div
      className={"divider " + dir + (active ? " active" : "")}
      title="Drag to resize — double-click to reset"
      onMouseDown={(e) => {
        e.preventDefault();
        const host = e.currentTarget.parentElement as HTMLElement | null;
        if (!host) return;
        setActive(true);
        const move = (ev: MouseEvent) => {
          const r = host.getBoundingClientRect();
          const f = dir === "h" ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
          dispatch({ type: "resize", splitId: id, ratio: Math.min(0.85, Math.max(0.15, f)) });
        };
        const up = () => {
          setActive(false);
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
      onDoubleClick={() => dispatch({ type: "resize", splitId: id, ratio: 0.5 })}
    />
  );
}

function GroupView({ id }: { id: string }) {
  const { layout, dispatch, ctx, drag, over, setDrag, setOver } = useWB();
  const ref = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  const group = layout.nodes[id];
  if (!group || group.kind !== "group") return null;
  const tabs = group.tabs.map((tid) => layout.tabs[tid]).filter((t): t is Tab => !!t);
  const activeTab = group.active ? layout.tabs[group.active] : null;
  const entry = activeTab ? MODULES[activeTab.moduleId] : null;

  const onDragOver = (e: React.DragEvent) => {
    const tabDrag = drag !== null || e.dataTransfer.types.includes(TAB_DRAG_MIME);
    const fileDrag = e.dataTransfer.types.includes(FILE_DRAG_MIME);
    if (!tabDrag && !fileDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = fileDrag ? "copy" : "move";
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let next: Over;
    if (tabDrag && e.clientY >= r.bottom - EDGE) next = { groupId: id, mode: "split", dir: "v" };
    else if (tabDrag && e.clientX >= r.right - EDGE) next = { groupId: id, mode: "split", dir: "h" };
    else {
      // insert index from the pointer position over the tab strip
      let index = tabs.length;
      const strip = el.querySelector<HTMLElement>(".tabstrip");
      if (strip) {
        const tr = strip.getBoundingClientRect();
        if (e.clientY <= tr.bottom) {
          index = 0;
          for (const t of Array.from(strip.querySelectorAll<HTMLElement>(".tab"))) {
            const br = t.getBoundingClientRect();
            if (e.clientX > br.left + br.width / 2) index += 1;
          }
        }
      }
      next = { groupId: id, mode: "insert", index };
    }
    if (JSON.stringify(next) !== JSON.stringify(over)) setOver(next);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.getData(FILE_DRAG_MIME);
    if (file) {
      if (ctx.projectOpen) dispatch({ type: "open", moduleId: "editor", params: { filePath: file }, groupId: id });
      setOver(null);
      setDrag(null);
      return;
    }
    if (!drag) return;
    const o = over;
    if (o && o.groupId === id && o.mode === "split") dispatch({ type: "split", groupId: id, dir: o.dir, withTabId: drag.tabId });
    else dispatch({ type: "move", tabId: drag.tabId, groupId: id, index: o && o.groupId === id && o.mode === "insert" ? o.index : undefined });
    setOver(null);
    setDrag(null);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (over?.groupId !== id) return;
    const el = ref.current;
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    setOver(null);
  };

  const splitOver = over?.groupId === id && over.mode === "split" ? over.dir : null;

  return (
    <div className="group" ref={ref} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
      <div className="tabstrip group-head">
        {tabs.map((t, i) => (
          <TabView key={t.id} tab={t} groupId={id} index={i} onMenu={(x, y) => setMenu({ x, y, tabId: t.id })} />
        ))}
        <span className="head-spacer" />
        {tabs.length === 0 && (
          <button className="tab-dots head-remove" title="Remove this empty pane" onClick={() => dispatch({ type: "removeGroup", groupId: id })}>
            <XIcon size={13} />
          </button>
        )}
        <button
          className="tab-dots"
          title="Split right — new pane next to this one (then drag a tab in)"
          onClick={() => dispatch({ type: "split", groupId: id, dir: "h" })}
        >
          <SplitRightIcon size={14} />
        </button>
        <button
          className="tab-dots"
          title="Split down — new pane below this one (then drag a tab in)"
          onClick={() => dispatch({ type: "split", groupId: id, dir: "v" })}
        >
          <SplitDownIcon size={14} />
        </button>
      </div>
      <div className="group-content">
        {activeTab && entry ? (
          entry.render(ctx, activeTab)
        ) : (
          <div className="area-empty">Drag a module here — or use the split buttons above.</div>
        )}
        {splitOver && <div className={"edge-line " + splitOver} />}
      </div>
      {menu && <TabMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function TabView({
  tab,
  groupId,
  index,
  onMenu,
}: {
  tab: Tab;
  groupId: string;
  index: number;
  onMenu: (x: number, y: number) => void;
}) {
  const { layout, dispatch, over, setDrag } = useWB();
  const def = MODULE_DEFS[tab.moduleId];
  const Icon = MODULES[tab.moduleId].icon;
  const group = layout.nodes[groupId];
  const active = group?.kind === "group" && group.active === tab.id;
  const dropBefore = over?.mode === "insert" && over.groupId === groupId && over.index === index;
  return (
    <div
      className={"tab" + (active ? " active" : "") + (dropBefore ? " drop-before" : "")}
      draggable
      title={`${def.title} — click to focus, drag to move (near a pane edge it splits)`}
      onDragStart={(e) => {
        e.dataTransfer.setData(TAB_DRAG_MIME, tab.id);
        e.dataTransfer.effectAllowed = "move";
        setDrag({ tabId: tab.id, fromGroup: groupId });
      }}
      onDragEnd={() => setDrag(null)}
      onClick={() => dispatch({ type: "activate", groupId, tabId: tab.id })}
    >
      <span className="tab-icon">
        <Icon size={13} />
      </span>
      <span className="tab-title">{tab.title}</span>
      <button
        className="tab-x"
        title="Close (Ctrl+W)"
        onClick={(e) => {
          e.stopPropagation();
          dispatch({ type: "close", tabId: tab.id });
        }}
      >
        <XIcon size={12} />
      </button>
      <button
        className="tab-dots"
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onMenu(r.right - 180, r.bottom);
        }}
      >
        <DotsIcon size={13} />
      </button>
    </div>
  );
}

function TabMenu({ menu, onClose }: { menu: { x: number; y: number; tabId: string }; onClose: () => void }) {
  const { layout, dispatch } = useWB();
  const groupId = groupOfTab(layout, menu.tabId);
  return (
    <div className="menu" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)), top: menu.y }} onClick={onClose}>
      <button className="menu-item" onClick={() => dispatch({ type: "close", tabId: menu.tabId })}>
        Close
      </button>
      {groupId && (
        <button
          className="menu-item"
          onClick={() => dispatch({ type: "fullscreen", nodeId: layout.fullscreen === groupId ? null : groupId })}
        >
          <span className="menu-item-icon">
            <ExpandIcon size={13} />
          </span>
          {layout.fullscreen === groupId ? "Exit fullscreen" : "Fullscreen pane"}
        </button>
      )}
    </div>
  );
}
