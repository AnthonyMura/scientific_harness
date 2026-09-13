// File explorer module: VSCode-style tree with file-type icons, create/rename/
// delete (inline edit + context menus), refresh/collapse-all and a settings gear.
import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { FileEntry } from "../types";
import type { AppCtx } from "../modules/ctx";
import { FILE_DRAG_MIME } from "../modules/layout";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import ContextMenu from "./ContextMenu";
import type { MenuItem } from "./ContextMenu";
import SettingsMenu from "./SettingsMenu";
import {
  CollapseAllIcon, ChevronDownIcon, ChevronRightIcon, entryIcon, FilePlusIcon,
  FolderPlusIcon, GearIcon, PencilIcon, RefreshIcon, TrashIcon,
} from "../icons";

export const EXPLORER_SETTINGS: SettingControl[] = [
  { kind: "number", key: "fontSize", label: "Font size", min: 10, max: 20, step: 1, unit: "px" },
  { kind: "toggle", key: "showHidden", label: "Show hidden files" },
];
export const EXPLORER_DEFAULTS: ModuleSettings = { fontSize: 13, showHidden: false };


/** File-type picker entries for "New File…" (PyCharm-style). */
const FILE_TYPES: { label: string; ext: string }[] = [
  { label: "LaTeX document", ext: "tex" },
  { label: "Markdown note", ext: "md" },
  { label: "Plain text", ext: "txt" },
];

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}
function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface Props {
  ctx: AppCtx;
}

export default function FileExplorer({ ctx }: Props) {
  const [settings, setSetting] = useModuleSettings("explorer", EXPLORER_DEFAULTS);
  const showHidden = !!settings.showHidden;
  const [byDir, setByDir] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ path: string } | null>(null);
  const [creating, setCreating] = useState<{ dir: string; kind: "file" | "dir"; ext?: string } | null>(null);
  const [fileTypeMenu, setFileTypeMenu] = useState<{ x: number; y: number; dir: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; name: string; isDir: boolean } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  // Refs so Enter + blur double-fires commit exactly once (stale closures safe).
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const renamingRef = useRef(renaming);
  renamingRef.current = renaming;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  async function load(dir: string) {
    try {
      const r = await api.tree(dir, showHiddenRef.current);
      setByDir((prev) => ({ ...prev, [dir]: r.entries }));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function reloadAll() {
    const dirs = ["", ...expandedRef.current];
    setByDir({});
    await Promise.all(
      dirs.map((d) =>
        api.tree(d, showHiddenRef.current).then((r) => setByDir((prev) => ({ ...prev, [d]: r.entries }))).catch(() => {}),
      ),
    );
  }

  // Reset + reload when a project is (re)opened or switched to another root.
  useEffect(() => {
    if (!ctx.projectOpen) return;
    setByDir({});
    setExpanded(new Set());
    setSelected(null);
    setError(null);
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.projectOpen, ctx.projectRoot]);

  // Toggling hidden files re-lists everything cached.
  useEffect(() => {
    if (!ctx.projectOpen) return;
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

  function entryAt(path: string): FileEntry | undefined {
    return byDir[parentDir(path)]?.find((e) => e.path === path);
  }

  function createTargetDir(): string {
    if (!selected) return "";
    const en = entryAt(selected);
    if (en?.is_dir) return selected;
    return parentDir(selected);
  }

  function toggle(dir: string) {
    if (expanded.has(dir)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(dir);
        return next;
      });
    } else {
      setExpanded((prev) => new Set(prev).add(dir));
      if (!byDir[dir]) void load(dir);
    }
  }

  function openFileTypeMenu(x: number, y: number, dir: string) {
    setRenaming(null);
    setCreating(null);
    setFileTypeMenu({ x, y, dir });
  }

  function startCreateIn(dir: string, kind: "file" | "dir", ext?: string) {
    setRenaming(null);
    setFileTypeMenu(null);
    setCreating({ dir, kind, ext });
    setDraft("");
  }

  async function commitCreate() {
    const c = creatingRef.current;
    const n = (draftRef.current || "").trim();
    if (!c) return; // already committed (Enter + blur double-fire)
    creatingRef.current = null;
    setCreating(null);
    if (!n) return;
    let name = n;
    if (c.ext && !/\.[A-Za-z0-9]{1,8}$/i.test(name)) name += "." + c.ext;
    try {
      await api.createPath((c.dir ? c.dir + "/" : "") + name, c.kind);
      void load(c.dir);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function startRename(e: FileEntry) {
    setCreating(null);
    setFileTypeMenu(null);
    setRenaming({ path: e.path });
    setDraft(e.name);
  }

  async function commitRename() {
    const r = renamingRef.current;
    const n = (draftRef.current || "").trim();
    if (!r) return; // already committed
    renamingRef.current = null;
    setRenaming(null);
    if (!n || n === baseName(r.path)) return;
    const target = (parentDir(r.path) ? parentDir(r.path) + "/" : "") + n;
    try {
      await api.renamePath(r.path, target);
      ctx.onFileRenamed(r.path, target);
      void load(parentDir(r.path));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function doDelete() {
    const c = confirmDelete;
    setConfirmDelete(null);
    if (!c) return;
    try {
      await api.deletePath(c.path);
      ctx.onPathsGone([c.path]);
      void load(parentDir(c.path));
      if (selected && (selected === c.path || selected.startsWith(c.path + "/"))) setSelected(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  // F2 renames the selected entry (skipped while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2" || !selected || renamingRef.current || creatingRef.current) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      e.preventDefault();
      startRename(entryAt(selected)!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function rowClick(e: FileEntry) {
    setSelected(e.path);
    if (e.is_dir) toggle(e.path); // single click: select + expand/collapse folders
  }

  if (!ctx.projectOpen) {
    return <div className="pane-empty">No project open. Use Open… or New… in the top bar.</div>;
  }

  const menuItems: MenuItem[] = menu
    ? menu.entry
      ? menu.entry.is_dir
        ? [
            { label: "New File…", icon: <FilePlusIcon size={13} />, action: () => openFileTypeMenu(menu.x, menu.y, menu.entry!.path) },
            { label: "New Folder", icon: <FolderPlusIcon size={13} />, action: () => startCreateIn(menu.entry!.path, "dir") },
            { separator: true },
            { label: "Rename", icon: <PencilIcon size={13} />, action: () => startRename(menu.entry!) },
            { label: "Delete", icon: <TrashIcon size={13} />, danger: true, action: () => setConfirmDelete({ path: menu.entry!.path, name: menu.entry!.name, isDir: true }) },
          ]
        : [
            { label: "Open", icon: <PencilIcon size={13} />, action: () => ctx.onOpenFile(menu.entry!.path) },
            { separator: true },
            { label: "Rename", icon: <PencilIcon size={13} />, action: () => startRename(menu.entry!) },
            { label: "Delete", icon: <TrashIcon size={13} />, danger: true, action: () => setConfirmDelete({ path: menu.entry!.path, name: menu.entry!.name, isDir: false }) },
          ]
      : [
          { label: "New File…", icon: <FilePlusIcon size={13} />, action: () => openFileTypeMenu(menu.x, menu.y, "") },
          { label: "New Folder", icon: <FolderPlusIcon size={13} />, action: () => startCreateIn("", "dir") },
          { separator: true },
          { label: "Refresh", icon: <RefreshIcon size={13} />, action: () => void reloadAll() },
        ]
    : [];

  const ftItems: MenuItem[] = fileTypeMenu
    ? [
        ...FILE_TYPES.map((ft) => ({
          label: ft.label,
          icon: <FilePlusIcon size={13} />,
          action: () => startCreateIn(fileTypeMenu.dir, "file", ft.ext),
        })),
        { separator: true },
        { label: "Other… (custom name)", icon: <PencilIcon size={13} />, action: () => startCreateIn(fileTypeMenu.dir, "file") },
      ]
    : [];

  function renderDir(dir: string, depth: number) {
    const entries = byDir[dir];
    if (!entries) return null;
    return (
      <>
        {creating && creating.dir === dir && (
          <div className="tree-row creating" style={{ paddingLeft: 8 + depth * 14 }}>
            <span className="twisty">{creating.kind === "dir" ? <FolderPlusIcon size={14} /> : <FilePlusIcon size={14} />}</span>
            <input
              autoFocus
              className="tree-input"
              placeholder={creating.kind === "dir" ? "folder name" : creating.ext ? `name.${creating.ext}` : "file name"}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") void commitCreate();
                if (ev.key === "Escape") setCreating(null);
              }}
              onBlur={() => void commitCreate()}
            />
          </div>
        )}
        {entries.map((e) => {
          const isRenaming = renaming?.path === e.path;
          return (
            <div key={e.path}>
              <div
                className={
                  "tree-row" +
                  (ctx.activeFile === e.path ? " active" : "") +
                  (selected === e.path ? " selected" : "")
                }
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => rowClick(e)}
                onDoubleClick={() => { if (!e.is_dir) ctx.onOpenFile(e.path); }}
                draggable={!e.is_dir}
                onDragStart={(ev) => {
                  if (e.is_dir) return;
                  ev.dataTransfer.setData(FILE_DRAG_MIME, e.path);
                  ev.dataTransfer.setData("text/plain", e.path);
                  ev.dataTransfer.effectAllowed = "copy";
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  setSelected(e.path);
                  setMenu({ x: ev.clientX, y: ev.clientY, entry: e });
                }}
              >
                <span className="twisty">
                  {e.is_dir ? (expanded.has(e.path) ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />) : null}
                </span>
                {entryIcon(e.name, e.is_dir, expanded.has(e.path))}
                {isRenaming ? (
                  <input
                    autoFocus
                    className="tree-input"
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") void commitRename();
                      if (ev.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => void commitRename()}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                ) : (
                  <span className="tree-name">{e.name}</span>
                )}
                {!isRenaming && (
                  <span className="row-actions">
                    {e.is_dir ? (
                      <>
                        <button type="button" title="New File in this folder" onClick={(ev) => { ev.stopPropagation(); openFileTypeMenu(ev.clientX, ev.clientY, e.path); }}>
                          <FilePlusIcon size={13} />
                        </button>
                        <button type="button" title="New Folder inside this folder" onClick={(ev) => { ev.stopPropagation(); startCreateIn(e.path, "dir"); }}>
                          <FolderPlusIcon size={13} />
                        </button>
                        <button type="button" title="Rename (F2)" onClick={(ev) => { ev.stopPropagation(); startRename(e); }}>
                          <PencilIcon size={13} />
                        </button>
                        <button type="button" title="Delete" className="danger" onClick={(ev) => { ev.stopPropagation(); setConfirmDelete({ path: e.path, name: e.name, isDir: true }); }}>
                          <TrashIcon size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" title="Rename (F2)" onClick={(ev) => { ev.stopPropagation(); startRename(e); }}>
                          <PencilIcon size={13} />
                        </button>
                        <button type="button" title="Delete" className="danger" onClick={(ev) => { ev.stopPropagation(); setConfirmDelete({ path: e.path, name: e.name, isDir: false }); }}>
                          <TrashIcon size={13} />
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>
              {e.is_dir && expanded.has(e.path) && renderDir(e.path, depth + 1)}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="explorer" style={{ "--fs-tree": `${settings.fontSize}px` } as React.CSSProperties}>
      <div className="pane-header">
        <span>Explorer</span>
        <span className="head-actions">
          <button type="button" title="New File (choose a file type)" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openFileTypeMenu(r.left, r.bottom + 4, createTargetDir()); }}>
            <FilePlusIcon size={14} />
          </button>
          <button type="button" title="New Folder" onClick={() => startCreateIn(createTargetDir(), "dir")}>
            <FolderPlusIcon size={14} />
          </button>
          <button type="button" title="Refresh tree" onClick={() => void reloadAll()}>
            <RefreshIcon size={14} />
          </button>
          <button type="button" title="Collapse All folders" onClick={() => setExpanded(new Set())}>
            <CollapseAllIcon size={14} />
          </button>
        </span>
        <button
          type="button"
          className="head-gear"
          title="Explorer settings (font size, hidden files)"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      <div className="tree-scroll" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, entry: null }); }}>
        {error && <div className="tree-error">{error}</div>}
        {renderDir("", 0)}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {fileTypeMenu && (
        <ContextMenu x={fileTypeMenu.x} y={fileTypeMenu.y} items={ftItems} onClose={() => setFileTypeMenu(null)} />
      )}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="Explorer settings"
          controls={EXPLORER_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
      {confirmDelete && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="pane-header"><span>Delete {confirmDelete.isDir ? "folder" : "file"}</span></div>
            <div className="modal-body">
              <div>
                Delete <code>{confirmDelete.path}</code>?
                {confirmDelete.isDir && " This removes the folder and everything inside it."} This cannot be undone.
              </div>
              <div className="card-actions">
                <button onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="danger" onClick={() => void doDelete()}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
