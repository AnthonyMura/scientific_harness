// Top bar: project actions only. The LaTeX compile controls (compile,
// auto-compile, target picker, SSH form) live in the PDF pane header —
// the "LaTeX container" of the workbench.
import type { Project } from "../types";

interface Props {
  project: Project | null;
  recent: Project[];
  devMode: boolean;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onPickRecent: (p: Project) => void;
  showInstall: boolean;
  onToggleInstall: () => void;
}

export default function ProjectBar({
  project, recent, devMode,
  onOpenFolder, onNewProject, onPickRecent,
  showInstall, onToggleInstall,
}: Props) {
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
        <span className="proj-name" title={project.root}>{project.name}</span>
      )}
      <span className="spacer" />
      {devMode && <span className="badge">browser dev mode</span>}
      <button onClick={onToggleInstall} className={showInstall ? "active" : ""}>
        Install TeX
      </button>
    </div>
  );
}
