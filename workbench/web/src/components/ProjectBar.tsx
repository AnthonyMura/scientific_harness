// Top bar: project actions + project settings (Overleaf-style: main file,
// compile target, auto-compile). The LaTeX Compile button itself lives in
// the editor pane header while a .tex file is open.
import { useState } from "react";
import type { Project } from "../types";
import type { AppCtx } from "../modules/ctx";
import ProjectSettingsMenu from "./ProjectSettingsMenu";
import { GearIcon } from "../icons";

interface Props {
  project: Project | null;
  recent: Project[];
  devMode: boolean;
  ctx: AppCtx;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onPickRecent: (p: Project) => void;
  showInstall: boolean;
  onToggleInstall: () => void;
}

export default function ProjectBar({
  project, recent, devMode, ctx,
  onOpenFolder, onNewProject, onPickRecent,
  showInstall, onToggleInstall,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="topbar">
      <span className="brand">Scientific Harness</span>
      <button onClick={onOpenFolder}>Open…</button>
      <button onClick={onNewProject}>New…</button>
      <select
        value=""
        onChange={(e) => {
          const p = recent.find((r) => r.id === e.target.value);
          if (p) onPickRecent(p);
        }}
        title="Recent projects"
      >
        <option value="">Recent…</option>
        {recent.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
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
