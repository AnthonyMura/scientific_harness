import { useState } from "react";
import type { Project, SshConfig, TargetStatus } from "../types";
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
  /** Persist the SSH compile-target config for the current project (M4). */
  onSaveSsh: (cfg: SshConfig) => void;
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
  targetStatuses, onTarget, onSaveSsh,
  onOpenFolder, onNewProject, onPickRecent,
  onCompile, onCancelJob, showInstall, onToggleInstall,
}: Props) {
  const [showSsh, setShowSsh] = useState(false);
  const [draft, setDraft] = useState<SshConfig>({});

  const openSshForm = () => {
    setDraft(project?.ssh ?? {});
    setShowSsh(true);
  };
  const saveSsh = () => {
    onSaveSsh(draft);
    setShowSsh(false);
  };

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
            <option value="ssh">SSH (remote)</option>
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
          <button
            type="button"
            className="target-ssh"
            onClick={openSshForm}
            title="Configure the SSH compile target (host, user, key)"
          >
            SSH…
          </button>
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
      {showSsh && project && (
        <div className="ssh-form">
          <h4>SSH compile target — {project.name}</h4>
          <label>Host
            <input
              value={draft.host ?? ""}
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
              placeholder="labserver"
            />
          </label>
          <label>User
            <input
              value={draft.user ?? ""}
              onChange={(e) => setDraft({ ...draft, user: e.target.value })}
              placeholder="alice"
            />
          </label>
          <label>Port
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.port ?? 22}
              onChange={(e) =>
                setDraft({ ...draft, port: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label>Key path
            <input
              value={draft.key ?? ""}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder="blank = default ssh keys"
            />
          </label>
          <label>Remote dir
            <input
              value={draft.remote_dir ?? ""}
              onChange={(e) => setDraft({ ...draft, remote_dir: e.target.value })}
              placeholder={`~/workbench/${project.name}`}
            />
          </label>
          <p className="ssh-form-note">
            Key-based auth only (no password prompts). The project is synced up before each compile;
            PDF + SyncTeX are pulled back. The remote machine needs TeX Live + latexmk.
          </p>
          <div className="ssh-form-actions">
            <button className="primary" onClick={saveSsh} disabled={!draft.host || !draft.user}>Save</button>
            <button onClick={() => setShowSsh(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
