// Module workbench shell: activity bar + a VSCode-style tree of splittable
// groups. Dragging a tab — or an activity-bar module — live-reflows the split
// ratios so the hovered pane grows and its neighbours step aside; dropping near
// any of a pane's four edges creates a new pane on that side, and dropping
// anywhere else inserts into the pane (empty panes light up as drop targets).
// A quiet quote from Newton sits behind every pane.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppCtx } from "../modules/ctx";
import { FILE_DRAG_MIME, MODULE_DRAG_MIME, TAB_DRAG_MIME, findParent, layoutReducer, pathToGroup } from "../modules/layout";
import type { LayoutAction, LayoutState, Tab } from "../modules/layout";
import { MODULE_DEFS, MODULE_ORDER } from "../modules/defs";
import { MODULES } from "../modules/registry";
import { DotsIcon, ExpandIcon, SplitDownIcon, SplitRightIcon, XIcon } from "../icons";

type DragState =
  | { kind: "tab"; tabId: string; fromGroup: string }
  | { kind: "module"; moduleId: string };

type Over =
  | { groupId: string; mode: "insert"; index: number }
  | { groupId: string; mode: "split"; dir: "h" | "v"; side: "before" | "after" };

interface WB {
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  ctx: AppCtx;
  drag: DragState | null;
  over: Over | null;
  /** Preview ratios for the splits on the hovered pane's path (live reflow). */
  preview: Record<string, number> | null;
  /** splitId -> starting share of child a, for panes growing in after a split. */
  entrance: Record<string, number>;
  /** The pane currently shrinking away before its removal commits. */
  closing: { splitId: string; groupId: string; ratio: number } | null;
  /** Drop an entrance entry once its animation has played. */
  onEntered: (splitId: string) => void;
  setDrag: (d: DragState | null) => void;
  setOver: (o: Over | null) => void;
}

const Ctx = createContext<WB>(null as unknown as WB);
const useWB = () => useContext(Ctx);

/** px from a pane edge that triggers "split" instead of insert. */
const EDGE = 26;
/** Share of the parent split the hovered pane grows to while dragging. */
const GROW = 0.62;

function dragName(drag: DragState | null, layout: LayoutState): string {
  if (!drag) return "a module";
  if (drag.kind === "tab") return layout.tabs[drag.tabId]?.title ?? "this tab";
  return MODULE_DEFS[drag.moduleId]?.title ?? "this module";
}

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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<Over | null>(null);

  // Pane open/close motion. When an action empties a non-root pane we first
  // shrink it to ~0 (a ratio override on its parent split), then commit the
  // action so the sibling glides into the freed space; the emptied pane fades
  // out meanwhile (`closing`). Splits that appear with one brand-new group
  // child animate that child in from zero (`entrance`).
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [closing, setClosing] = useState<{ splitId: string; groupId: string; ratio: number } | null>(null);
  const pendingRef = useRef<{ timer: number; action: LayoutAction } | null>(null);

  const animatedDispatch = useCallback(
    (action: LayoutAction) => {
      if (pendingRef.current) {
        window.clearTimeout(pendingRef.current.timer);
        const flushed = pendingRef.current.action;
        dispatch(flushed); // flush the in-flight collapse first
        layoutRef.current = layoutReducer(layoutRef.current, flushed); // keep detection in sync
        pendingRef.current = null;
        setClosing(null);
      }
      const cur = layoutRef.current;
      const next = layoutReducer(cur, action);
      if (next === cur) return;
      const removed = Object.keys(cur.nodes).filter((id) => cur.nodes[id].kind === "group" && !next.nodes[id]);
      const p = removed.length === 1 ? findParent(cur.nodes, cur.rootId, removed[0]) : null;
      if (p) {
        setClosing({ splitId: p.split.id, groupId: removed[0], ratio: p.which === "a" ? 0.02 : 0.98 });
        pendingRef.current = {
          action,
          timer: window.setTimeout(() => {
            pendingRef.current = null;
            setClosing(null);
            dispatch(action);
          }, 210),
        };
        return;
      }
      dispatch(action);
    },
    [dispatch],
  );

  // Ctrl+W closes the focused pane's active tab; Esc exits fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layout.fullscreen) {
        animatedDispatch({ type: "fullscreen", nodeId: null });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        const g = layout.focusedGroup ? layout.nodes[layout.focusedGroup] : null;
        if (g && g.kind === "group" && g.active) {
          e.preventDefault();
          animatedDispatch({ type: "close", tabId: g.active });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, animatedDispatch]);

  // Live reflow: while a drag hovers a pane, grow the hovered branch to GROW
  // at every split on its path so neighbours step aside and make room.
  const preview = useMemo(() => {
    if (!drag || !over) return null;
    const rootId = layout.fullscreen ?? layout.rootId;
    const chain = pathToGroup(layout.nodes, rootId, over.groupId);
    if (!chain) return null;
    const m: Record<string, number> = {};
    for (const { split, which } of chain) {
      m[split.id] = which === "a" ? Math.max(split.ratio, GROW) : Math.min(split.ratio, 1 - GROW);
    }
    return m;
  }, [drag, over, layout]);

  // Entrance map: for splits that just appeared with exactly one brand-new
  // group child, the starting share of child a (the fresh pane grows in).
  const [entrance, setEntrance] = useState<Record<string, number>>({});
  const prevNodesRef = useRef(layout.nodes);
  useEffect(() => {
    const prev = prevNodesRef.current;
    if (prev === layout.nodes) return;
    prevNodesRef.current = layout.nodes;
    const add: Record<string, number> = {};
    for (const id of Object.keys(layout.nodes)) {
      const n = layout.nodes[id];
      if (n.kind !== "split" || prev[id]) continue;
      const aNew = !prev[n.a];
      const bNew = !prev[n.b];
      if (aNew && !bNew) add[id] = 0; // new pane is child a: grows from 0
      else if (bNew && !aNew) add[id] = 1; // new pane is child b: a shrinks from full
    }
    if (Object.keys(add).length) setEntrance((m) => ({ ...m, ...add }));
  }, [layout.nodes]);
  const onEntered = useCallback((splitId: string) => {
    setEntrance((m) => {
      if (!(splitId in m)) return m;
      const rest = { ...m };
      delete rest[splitId];
      return rest;
    });
  }, []);

  // While a pane is closing, its parent split's ratio is overridden so the
  // emptied side shrinks to ~0 before the removal commits.
  const effPreview = closing ? { ...preview, [closing.splitId]: closing.ratio } : preview;

  const wb = useMemo<WB>(
    () => ({ layout, dispatch: animatedDispatch, ctx, drag, over, preview: effPreview, entrance, closing, onEntered, setDrag, setOver }),
    [layout, animatedDispatch, ctx, drag, over, effPreview, entrance, closing, onEntered],
  );
  const rootId = layout.fullscreen ?? layout.rootId;
  if (!layout.nodes[rootId]) return null;

  return (
    <Ctx.Provider value={wb}>
      <div className="wb">
        <ActivityBar />
        <div className={"wb-main" + (drag ? " dragging" : "")}>
          <div className="wb-quote" aria-hidden="true">
            <blockquote>
              If I have seen further it is by standing on the shoulders of Giants.
              <cite>Isaac Newton · letter to Robert Hooke, 1675</cite>
            </blockquote>
          </div>
          <NodeView id={rootId} />
          {layout.fullscreen && (
            <button className="fs-exit" title="Exit fullscreen (Esc)" onClick={() => animatedDispatch({ type: "fullscreen", nodeId: null })}>
              <XIcon size={14} />
            </button>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}

function ActivityBar() {
  const { layout, dispatch, ctx, setDrag } = useWB();
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
            title={`${def.title} — ${openModules.has(id) ? "focus its pane" : "open in its home pane"} · drag into any pane`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(MODULE_DRAG_MIME, id);
              e.dataTransfer.effectAllowed = "move";
              setDrag({ kind: "module", moduleId: id });
            }}
            onDragEnd={() => setDrag(null)}
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
  const { layout, preview, entrance, onEntered } = useWB();
  const node = layout.nodes[id];
  if (!node) return null;
  if (node.kind === "group") return <GroupView id={id} />;
  const h = node.dir === "h";
  const ratio = preview?.[node.id] ?? node.ratio;
  const enterFrom = entrance[node.id];
  const childStyle = {
    ...(h ? { width: `${ratio * 100}%` } : { height: `${ratio * 100}%` }),
    ...(enterFrom !== undefined ? { "--enter-from": `${enterFrom * 100}%` } : {}),
  } as React.CSSProperties;
  return (
    <div className={"split " + (h ? "h" : "v")}>
      <div
        className={"split-child" + (enterFrom !== undefined ? " enter" : "")}
        style={childStyle}
        onAnimationEnd={(e) => {
          if (enterFrom !== undefined && e.target === e.currentTarget) onEntered(node.id);
        }}
      >
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
  const { layout, dispatch, ctx, drag, over, setDrag, setOver, closing } = useWB();
  const ref = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  const group = layout.nodes[id];
  if (!group || group.kind !== "group") return null;
  const tabs = group.tabs.map((tid) => layout.tabs[tid]).filter((t): t is Tab => !!t);
  const activeTab = group.active ? layout.tabs[group.active] : null;
  const entry = activeTab ? MODULES[activeTab.moduleId] : null;
  const insertAt = over?.groupId === id && over.mode === "insert" ? over.index : null;

  const onDragOver = (e: React.DragEvent) => {
    const tabDrag = drag?.kind === "tab" || e.dataTransfer.types.includes(TAB_DRAG_MIME);
    const moduleDrag = drag?.kind === "module" || e.dataTransfer.types.includes(MODULE_DRAG_MIME);
    const fileDrag = e.dataTransfer.types.includes(FILE_DRAG_MIME);
    if (!tabDrag && !moduleDrag && !fileDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = fileDrag ? "copy" : "move";
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let next: Over;
    if (tabDrag || moduleDrag) {
      // Nearest pane edge within EDGE px → split on that side.
      const cand: { dist: number; o: Over }[] = [
        { dist: e.clientY - r.top, o: { groupId: id, mode: "split", dir: "v", side: "before" } },
        { dist: r.bottom - e.clientY, o: { groupId: id, mode: "split", dir: "v", side: "after" } },
        { dist: e.clientX - r.left, o: { groupId: id, mode: "split", dir: "h", side: "before" } },
        { dist: r.right - e.clientX, o: { groupId: id, mode: "split", dir: "h", side: "after" } },
      ];
      const edges = cand.filter((c) => c.dist >= 0 && c.dist <= EDGE);
      if (edges.length) {
        edges.sort((a, b) => a.dist - b.dist);
        next = edges[0].o;
      } else {
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
    } else {
      next = { groupId: id, mode: "insert", index: tabs.length };
    }
    if (JSON.stringify(next) !== JSON.stringify(over)) setOver(next);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.getData(FILE_DRAG_MIME);
    if (file) {
      if (ctx.projectOpen) {
        if (/\.pdf$/i.test(file)) ctx.onOpenPdf(file); // PDFs land in the PDF pane
        else dispatch({ type: "open", moduleId: "editor", params: { filePath: file }, groupId: id });
      }
      setOver(null);
      setDrag(null);
      return;
    }
    const o = over && over.groupId === id ? over : null;
    if (drag?.kind === "module") {
      if (o?.mode === "split") {
        dispatch({ type: "split", groupId: id, dir: o.dir, side: o.side, withModuleId: drag.moduleId });
      } else {
        const def = MODULE_DEFS[drag.moduleId];
        const tid = def ? def.tabId() : null;
        if (tid && layout.tabs[tid]) dispatch({ type: "move", tabId: tid, groupId: id });
        else dispatch({ type: "open", moduleId: drag.moduleId, groupId: id });
      }
    } else if (drag?.kind === "tab") {
      if (o?.mode === "split") dispatch({ type: "split", groupId: id, dir: o.dir, side: o.side, withTabId: drag.tabId });
      else dispatch({ type: "move", tabId: drag.tabId, groupId: id, index: o?.mode === "insert" ? o.index : undefined });
    }
    setOver(null);
    setDrag(null);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (over?.groupId !== id) return;
    const el = ref.current;
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    setOver(null);
  };

  const splitOver = over?.groupId === id && over.mode === "split" ? over : null;
  const edgeClass = splitOver
    ? splitOver.dir === "v"
      ? splitOver.side === "before"
        ? "top"
        : "bottom"
      : splitOver.side === "before"
        ? "left"
        : "right"
    : null;
  const dropTarget = tabs.length === 0 && insertAt !== null;

  return (
    <div
      className={
        "group" +
        (tabs.length === 0 ? " empty" : "") +
        (dropTarget ? " drop-target" : "") +
        (closing?.groupId === id ? " dying" : "")
      }
      ref={ref}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onClick={() => {
        // Clicking a pane activates it — that is what makes the Explorer's
        // single-click open work. The Explorer selects files and the Structure
        // outline jumps the cursor or scrolls the PDF; neither may steal
        // activation from the pane the user is reading in (issue 38).
        if (activeTab?.moduleId === "explorer" || activeTab?.moduleId === "structure") return;
        dispatch({ type: "focus", groupId: id });
      }}
    >
      <div className="tabstrip group-head">
        {tabs.map((t, i) => {
          let dropAt: "before" | "after" | null = null;
          if (insertAt !== null) {
            if (insertAt === i) dropAt = "before";
            else if (insertAt === tabs.length && i === tabs.length - 1) dropAt = "after";
          }
          return <TabView key={t.id} tab={t} groupId={id} index={i} dropAt={dropAt} onMenu={(x, y) => setMenu({ x, y, tabId: t.id })} />;
        })}
        <span className="head-spacer" />
        {tabs.length === 0 && id !== layout.rootId && (
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
        ) : dropTarget ? (
          <div className="area-empty drop-target-area">Drop “{dragName(drag, layout)}” here</div>
        ) : (
          <div className="area-empty">
            {ctx.projectOpen
              ? "Click a file in the Explorer to open it — or drag a module here."
              : "Drag a module here — or use the split buttons above."}
          </div>
        )}
        {edgeClass && <div className={"edge-line " + edgeClass} />}
      </div>
      {menu && <TabMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function TabView({
  tab,
  groupId,
  index,
  dropAt,
  onMenu,
}: {
  tab: Tab;
  groupId: string;
  index: number;
  dropAt: "before" | "after" | null;
  onMenu: (x: number, y: number) => void;
}) {
  const { layout, dispatch, setDrag, setOver } = useWB();
  const def = MODULE_DEFS[tab.moduleId];
  const Icon = MODULES[tab.moduleId].icon;
  const group = layout.nodes[groupId];
  const active = group?.kind === "group" && group.active === tab.id;
  return (
    <div
      className={
        "tab" + (active ? " active" : "") + (dropAt === "before" ? " drop-before" : "") + (dropAt === "after" ? " drop-after" : "")
      }
      draggable
      title={`${def.title} — click to focus, drag to move (near a pane edge it splits)`}
      onDragStart={(e) => {
        e.dataTransfer.setData(TAB_DRAG_MIME, tab.id);
        e.dataTransfer.effectAllowed = "move";
        setDrag({ kind: "tab", tabId: tab.id, fromGroup: groupId });
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
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
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => dispatch({ type: "resetLayout" })}>
        Reset layout to default
      </button>
    </div>
  );
}
