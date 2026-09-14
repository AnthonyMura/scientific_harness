import type { Project, TargetStatus } from "../types";
import {
  COMPILE_TARGETS, hasWslTarget, installHint, needsInstall, targetTooltip,
} from "../modules/targets-ui";

interface Props {
  project: Project | null;
  recent: Project[];
  devMode: boolean;
  jobRunning: boolean;
  autoCompile: boolean;
  onAutoCompile: (on: boolean) => void;
  /** Probe results from /api/install/status (null while probing). */
  targetStatuses: TargetStatus[] | null;
  onTarget: (target: string) => void;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onPickRecent: (p: Project) => void;
  onCompile: () => void;
  onCancelJob: () => void;
  showInstall: boolean;
  onToggleInstall: () => void;
}

export default function ProjectBar({
  project, recent, devMode, jobRunning, autoCompile, onAutoCompile,
  targetStatuses, onTarget,
  onOpenFolder, onNewProject, onPickRecent,
  onCompile, onCancelJob, showInstall, onToggleInstall,
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
      {project && (
        <label className="auto-compile" title="Compile automatically after saving a .tex file">
          <input type="checkbox" checked={autoCompile} onChange={(e) => onAutoCompile(e.target.checked)} />
          Auto-compile
        </label>
      )}
      {project && (
        <span className="target-pick">
          <span className="target-label">Target</span>
          <select
            value={project.target}
            onChange={(e) => onTarget(e.target.value)}
            title={targetTooltip(project.target, targetStatuses)}
          >
            {!(COMPILE_TARGETS as readonly string[]).includes(project.target) && (
              <option value={project.target} disabled>{project.target} — unavailable</option>
            )}
            <option value="auto">Auto</option>
            <option value="local">Local (host TeX)</option>
            {hasWslTarget(targetStatuses) && <option value="wsl">WSL</option>}
          </select>
          {needsInstall(project.target, targetStatuses) && (
            <button
              type="button"
              className="target-warn"
              title={installHint(project.target, targetStatuses)}
              onClick={onToggleInstall}
            >
              TeX missing — install
            </button>
          )}
        </span>
      )}
      <button onClick={onToggleInstall} className={showInstall ? "active" : ""}>
        Install TeX
      </button>
      {jobRunning ? (
        <button onClick={onCancelJob} className="danger">Cancel</button>
      ) : (
        <button onClick={onCompile} disabled={!project} className="primary">Compile</button>
      )}
    </div>
  );
}
