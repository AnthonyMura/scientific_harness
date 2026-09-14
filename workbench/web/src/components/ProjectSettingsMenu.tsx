// Project settings popover (Overleaf-style): the main .tex file is chosen
// from the project's file list - not typed by name - plus the compile target
// and auto-compile. Persists to .workbench/project.json via /api/config.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SshConfig } from "../types";
import type { AppCtx } from "../modules/ctx";
import { COMPILE_TARGETS, hasWslTarget, installHint, needsInstall, targetTooltip } from "../modules/targets-ui";

interface Props {
  x: number;
  y: number;
  ctx: AppCtx;
  onClose: () => void;
}

export default function ProjectSettingsMenu({ x, y, ctx, onClose }: Props) {
  const project = ctx.project;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [showSsh, setShowSsh] = useState(false);
  const [draft, setDraft] = useState<SshConfig>({});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!project) return null;
  const texFiles = ctx.texFiles ?? [];

  return createPortal(
    <div className="menu settings proj-settings" ref={ref} style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Project settings">
      <div className="menu-title">Project settings — {project.name}</div>
      <div className="set-row">
        <span className="set-label">Main file</span>
        <select
          className="set-select proj-main-pick"
          value={texFiles.includes(project.main_file) ? project.main_file : ""}
          onChange={(e) => ctx.onSaveMainFile(e.target.value)}
          title="The document the Compile button and auto-compile build (Overleaf-style)"
        >
          {texFiles.length === 0 && <option value="">no .tex files</option>}
          {texFiles.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="set-row wrap">
        <span className="set-label">Compile target</span>
        <span className="target-pick">
          <select
            value={project.target}
            onChange={(e) => ctx.onTarget(e.target.value)}
            title={targetTooltip(project.target, ctx.targetStatuses)}
          >
            {!(COMPILE_TARGETS as readonly string[]).includes(project.target) && (
              <option value={project.target} disabled>{project.target} — unavailable</option>
            )}
            <option value="auto">Auto</option>
            <option value="local">Local (host TeX)</option>
            {hasWslTarget(ctx.targetStatuses) && <option value="wsl">WSL</option>}
            <option value="ssh">SSH (remote)</option>
          </select>
          {needsInstall(project.target, ctx.targetStatuses) && (
            <button type="button" className="target-warn" title={installHint(project.target, ctx.targetStatuses)} onClick={() => ctx.onShowInstall()}>
              TeX missing — install
            </button>
          )}
          <button
            type="button"
            className="target-ssh"
            onClick={() => {
              setDraft(project.ssh ?? {});
              setShowSsh(true);
            }}
            title="Configure the SSH compile target (host, user, key)"
          >
            SSH…
          </button>
        </span>
      </div>
      <div className="set-row">
        <span className="set-label">Auto-compile</span>
        <button
          type="button"
          className={"set-toggle" + (project.auto_compile ? " on" : "")}
          onClick={() => ctx.onAutoCompile(!project.auto_compile)}
        >
          {project.auto_compile ? "On" : "Off"}
        </button>
      </div>
      {showSsh && (
        <div className="ssh-inline">
          <h4>SSH compile target</h4>
          <label>Host
            <input value={draft.host ?? ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="labserver" />
          </label>
          <label>User
            <input value={draft.user ?? ""} onChange={(e) => setDraft({ ...draft, user: e.target.value })} placeholder="alice" />
          </label>
          <label>Port
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.port ?? 22}
              onChange={(e) => setDraft({ ...draft, port: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>Key path
            <input value={draft.key ?? ""} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="blank = default ssh keys" />
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
          <div className="card-actions">
            <button
              className="primary"
              onClick={() => {
                ctx.onSaveSsh(draft);
                setShowSsh(false);
              }}
              disabled={!draft.host || !draft.user}
            >
              Save
            </button>
            <button onClick={() => setShowSsh(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
