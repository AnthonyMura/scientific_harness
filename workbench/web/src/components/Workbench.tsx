// The module workbench shell: activity bar + four areas with draggable tabs,
// resizable dividers and fullscreen. VSCode-style layout logic lives here;
// each area's content is whatever module tab is active in it.
import React, { useEffect, useState } from "react";
import type { AppCtx } from "../modules/ctx";
import { MODULE_DEFS, MODULE_ORDER } from "../modules/defs";
import { MODULES } from "../modules/registry";
import { AREA_LABELS, AREAS } from "../modules/layout";
import type { AreaId, LayoutAction, LayoutState } from "../modules/layout";
import ContextMenu from "./ContextMenu";
import type { MenuItem } from "./ContextMenu";
import { DotsIcon, ExpandIcon, XIcon } from "../icons";

interface DragState {
  tabId: string;
  fromArea: AreaId;
}
interface OverState {
  area: AreaId;
  index?: number;
}
interface Dnd {
  drag: DragState | null;
  over: OverState | null;
  onDragStart: (e: React.DragEvent, area: AreaId, tabId: string) => void;
  onTabDragOver: (e: React.DragEvent, area: AreaId, index: number) => void;
  onAreaDragOver: (e: React.DragEvent, area: AreaId) => void;
  onDrop: (e: React.DragEvent, area: AreaId, index?: number) => void;
  endDrag: () => void;
}

const EMPTY_HINT: Record<AreaId, string> = {
  sidebar: "No modules here.\nDrag a tab from another area.",
  center: "No editor open.\nClick a file in the Explorer or use the activity bar.",
  right: "Drop a module here.",
  panel: "No modules in the bottom panel.",
};

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
  const [over, setOver] = useState<OverState | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  // Esc exits fullscreen.
  useEffect(() => {
    if (!layout.fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "fullscreen", area: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout.fullscreen, dispatch]);

  // Ctrl/Cmd+W closes the active center tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        const id = layout.active.center;
        if (id) {
          e.preventDefault();
          dispatch({ type: "close", tabId: id });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout.active.center, dispatch]);

  const dnd: Dnd = {
    drag,
    over,
    onDragStart: (e, area, tabId) => {
      e.dataTransfer.setData("text/plain", tabId);
      e.dataTransfer.effectAllowed = "move";
      setDrag({ tabId, fromArea: area });
    },
    onTabDragOver: (e, area, index) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver((o) => (o && o.area === area && o.index === index ? o : { area, index }));
    },
    onAreaDragOver: (e, area) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver((o) => (o && o.area === area && o.index === undefined ? o : { area }));
    },
    onDrop: (e, area, index) => {
      e.preventDefault();
      if (drag) dispatch({ type: "move", tabId: drag.tabId, toArea: area, index });
      setDrag(null);
      setOver(null);
    },
    endDrag: () => {
      setDrag(null);
      setOver(null);
    },
  };

  const startResize = (key: "sidebar" | "right" | "panel") => (e: React.MouseEvent) => {
    e.preventDefault();
    const horizontal = key !== "panel";
    const start = horizontal ? e.clientX : e.clientY;
    const initial = layout.widths[key];
    const move = (ev: MouseEvent) => {
      const delta = (horizontal ? ev.clientX - start : ev.clientY - start) * (key === "right" ? -1 : 1);
      dispatch({ type: "resize", key, value: initial + delta });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const openTabMenu = (tabId: string, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTabMenu({ x: r.left, y: r.bottom + 4, tabId });
  };

  const rightVisible = !layout.collapsed.right && layout.areas.right.length > 0;
  const fs = layout.fullscreen;

  const areaEl = (area: AreaId, style?: React.CSSProperties) => (
    <div className={"area " + area} style={style}>
      <AreaView area={area} layout={layout} dispatch={dispatch} ctx={ctx} dnd={dnd} openTabMenu={openTabMenu} />
    </div>
  );

  return (
    <div className="wb">
      <ActivityBar layout={layout} dispatch={dispatch} jobRunning={!!ctx.job && ctx.job.status === "running"} />
      {fs ? (
        areaEl(fs)
      ) : (
        <div className="wb-main">
          {!layout.collapsed.sidebar && (
            <>
              {areaEl("sidebar", { width: layout.widths.sidebar })}
              <div
                className="resizer v"
                onMouseDown={startResize("sidebar")}
                onDoubleClick={() => dispatch({ type: "collapse", area: "sidebar" })}
                title="Drag to resize · double-click to collapse"
              />
            </>
          )}
          <div className="wb-center-col">
            {areaEl("center")}
            {!layout.collapsed.panel && (
              <>
                <div
                  className="resizer h"
                  onMouseDown={startResize("panel")}
                  onDoubleClick={() => dispatch({ type: "collapse", area: "panel" })}
                  title="Drag to resize · double-click to collapse"
                />
                {areaEl("panel", { height: layout.widths.panel })}
              </>
            )}
          </div>
          {rightVisible && (
            <>
              <div
                className="resizer v"
                onMouseDown={startResize("right")}
                onDoubleClick={() => dispatch({ type: "collapse", area: "right" })}
                title="Drag to resize · double-click to collapse"
              />
              {areaEl("right", { width: layout.widths.right })}
            </>
          )}
        </div>
      )}
      {tabMenu && <TabMenu menu={tabMenu} layout={layout} dispatch={dispatch} onClose={() => setTabMenu(null)} />}
    </div>
  );
}

function ActivityBar({
  layout,
  dispatch,
  jobRunning,
}: {
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  jobRunning: boolean;
}) {
  const focused = (moduleId: string): boolean => {
    for (const a of AREAS) {
      const id = layout.active[a];
      if (id && layout.tabs[id]?.moduleId === moduleId) return true;
    }
    return false;
  };
  return (
    <div className="activity-bar">
      {MODULE_ORDER.map((id) => {
        const def = MODULE_DEFS[id];
        const entry = MODULES[id];
        const hasTab = Object.values(layout.tabs).some((t) => t.moduleId === id);
        return (
          <button
            key={id}
            type="button"
            className={
              "ab-item" +
              (focused(id) ? " active" : "") +
              (id === "log" && jobRunning ? " busy" : "")
            }
            title={`${def.title} — ${AREA_LABELS[def.defaultArea]}`}
            onClick={() => dispatch({ type: "open", moduleId: id })}
          >
            <entry.icon size={22} />
            {hasTab && <span className="ab-dot" />}
          </button>
        );
      })}
    </div>
  );
}

function AreaView({
  area,
  layout,
  dispatch,
  ctx,
  dnd,
  openTabMenu,
}: {
  area: AreaId;
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  ctx: AppCtx;
  dnd: Dnd;
  openTabMenu: (tabId: string, e: React.MouseEvent) => void;
}) {
  const tabIds = layout.areas[area];
  const activeId = layout.active[area];
  const activeTab = activeId ? layout.tabs[activeId] : null;

  return (
    <div
      className={"area-inner" + (dnd.over?.area === area ? " drop-target" : "")}
      onDragOver={(e) => dnd.onAreaDragOver(e, area)}
      onDrop={(e) => dnd.onDrop(e, area)}
    >
      {tabIds.length > 0 && (
        <div className="tabstrip">
          {tabIds.map((id, i) => {
            const tab = layout.tabs[id];
            if (!tab) return null;
            const Icon = MODULES[tab.moduleId]?.icon;
            return (
              <div
                key={id}
                className={
                  "tab" +
                  (id === activeId ? " active" : "") +
                  (dnd.over?.area === area && dnd.over?.index === i && dnd.drag?.tabId !== id ? " drop-before" : "")
                }
                draggable
                onDragStart={(e) => dnd.onDragStart(e, area, id)}
                onDragOver={(e) => dnd.onTabDragOver(e, area, i)}
                onDrop={(e) => {
                  e.stopPropagation();
                  dnd.onDrop(e, area, i);
                }}
                onClick={() => dispatch({ type: "activate", area, tabId: id })}
              >
                {Icon && <span className="tab-icon"><Icon size={14} /></span>}
                <span className="tab-title" title={tab.params?.filePath ? String(tab.params.filePath) : MODULE_DEFS[tab.moduleId].title}>
                  {tab.title}
                </span>
                <button
                  type="button"
                  className="tab-x"
                  title="Close (Ctrl+W)"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "close", tabId: id });
                  }}
                >
                  <XIcon size={12} />
                </button>
                <button type="button" className="tab-dots" title="More actions" onClick={(e) => openTabMenu(id, e)}>
                  <DotsIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="area-content">
        {activeTab ? (
          MODULES[activeTab.moduleId]?.render(ctx, activeTab)
        ) : (
          <div className="area-empty">{EMPTY_HINT[area]}</div>
        )}
      </div>
    </div>
  );
}

function TabMenu({
  menu,
  layout,
  dispatch,
  onClose,
}: {
  menu: { x: number; y: number; tabId: string };
  layout: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
  onClose: () => void;
}) {
  const area = AREAS.find((a) => layout.areas[a].includes(menu.tabId));
  if (!area) return null;
  const items: MenuItem[] = [
    { label: "Close", icon: <XIcon size={13} />, action: () => dispatch({ type: "close", tabId: menu.tabId }) },
    { separator: true },
    ...AREAS.filter((a) => a !== area).map((a) => ({
      label: `Move to ${AREA_LABELS[a]}`,
      action: () => dispatch({ type: "move", tabId: menu.tabId, toArea: a }),
    })),
    { separator: true },
    {
      label: layout.fullscreen === area ? "Exit Fullscreen" : "Fullscreen",
      icon: <ExpandIcon size={13} />,
      action: () => dispatch({ type: "fullscreen", area: layout.fullscreen === area ? null : area }),
    },
  ];
  return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={onClose} />;
}
