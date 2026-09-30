// Top bar: project actions + project settings (Overleaf-style: main file,
// compile target, auto-compile). The LaTeX Compile button itself lives in
// the editor pane header while a .tex file is open.
import { useEffect, useRef, useState } from "react";
import type { Project } from "../types";
import type { AppCtx } from "../modules/ctx";
import ProjectSettingsMenu from "./ProjectSettingsMenu";
import { ChevronDownIcon, GearIcon, XIcon } from "../icons";

interface Props {
  project: Project | null;
  recent: Project[];
  devMode: boolean;
  ctx: AppCtx;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onPickRecent: (p: Project) => void;
  onRemoveRecent: (p: Project) => void;
  showInstall: boolean;
  onToggleInstall: () => void;
}

export default function ProjectBar({
  project, recent, devMode, ctx,
  onOpenFolder, onNewProject, onPickRecent, onRemoveRecent,
  showInstall, onToggleInstall,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState<{ x: number; y: number } | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const recentRef = useRef<HTMLDivElement>(null);

  // Close the recents dropdown on outside click / Escape (issue 45).
  useEffect(() => {
    if (!recentOpen) return;
    const onDown = (e: MouseEvent) => {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) setRecentOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecentOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [recentOpen]);

  return (
    <div className="topbar">
      <span className="brand">Scientific Harness</span>
      <button onClick={onOpenFolder}>Open…</button>
      <button onClick={onNewProject}>New…</button>
      <div className="recent-wrap" ref={recentRef}>
        <button
          type="button"
          className={"recent-trigger" + (recentOpen ? " open" : "")}
          title="Recent projects (keeps the last 20)"
          aria-haspopup="menu"
          aria-expanded={recentOpen}
          onClick={() => setRecentOpen((v) => !v)}
        >
          Recent… <ChevronDownIcon size={12} />
        </button>
        {recentOpen && (
          <div className="menu recent-menu" role="menu" aria-label="Recent projects">
            {recent.length === 0 ? (
              <div className="menu-empty">No recent projects</div>
            ) : (
              recent.map((p) => (
                <div key={p.id} className="recent-row" title={p.root}>
                  <button
                    type="button"
                    className="recent-name"
                    onClick={() => {
                      setRecentOpen(false);
                      onPickRecent(p);
                    }}
                  >
                    {p.name}
                  </button>
                  {/* The open project re-enters the list on every open, so it gets no ×. */}
                  {(!project || p.id !== project.id) && (
                    <button
                      type="button"
                      className="recent-x"
                      title={`Remove ${p.name} from recent projects`}
                      aria-label={`Remove ${p.name} from recent projects`}
                      onClick={() => onRemoveRecent(p)}
                    >
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {project && (
        <>
          <span className="proj-name" title={project.root}>{project.name}</span>
          <button
            type="button"
            className="head-gear"
            title="Project settings — main file, compile target, auto-compile"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSettingsOpen({ x: r.right, y: r.bottom + 4 });
            }}
          >
            <GearIcon size={14} />
          </button>
        </>
      )}
      <span className="spacer" />
      {devMode && <span className="badge">browser dev mode</span>}
      <button onClick={onToggleInstall} className={showInstall ? "active" : ""}>
        Install TeX
      </button>
      {settingsOpen && project && (
        <ProjectSettingsMenu x={settingsOpen.x} y={settingsOpen.y} ctx={ctx} onClose={() => setSettingsOpen(null)} />
      )}
    </div>
  );
}
