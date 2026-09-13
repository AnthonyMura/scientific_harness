// Run log module: live compile/install output, errors and artifacts.
import { useEffect, useRef, useState } from "react";
import type { AppCtx } from "../modules/ctx";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import { GearIcon } from "../icons";

export const LOG_SETTINGS: SettingControl[] = [
  { kind: "number", key: "fontSize", label: "Font size", min: 10, max: 20, step: 1, unit: "px" },
];
export const LOG_DEFAULTS: ModuleSettings = { fontSize: 12 };

const STATUS_LABEL: Record<string, string> = {
  running: "running…",
  done: "finished",
  error: "failed",
  cancelled: "cancelled",
};

interface Props {
  ctx: AppCtx;
}

export default function LogPanel({ ctx }: Props) {
  const [settings, setSetting] = useModuleSettings("log", LOG_DEFAULTS);
  const job = ctx.job;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.logLines.length]);

  const fs = typeof settings.fontSize === "number" ? settings.fontSize : 12;

  return (
    <div className="log-panel" style={{ "--fs-log": `${fs}px` } as React.CSSProperties}>
      <div className="pane-header">
        <span>
          {job ? `${job.kind} · ${job.label}` : "Run log"}
          {job && <span className={"chip " + job.status}>{STATUS_LABEL[job.status] ?? job.status}</span>}
        </span>
        {job?.status === "running" && (
          <button className="mini danger" onClick={ctx.onCancelJob}>Cancel</button>
        )}
        <span className="head-spacer" />
        <button
          type="button"
          className="head-gear"
          title="Run log settings"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>
      {!job ? (
        <div className="pane-empty">No runs yet. Press ▶ Compile or start an install.</div>
      ) : (
        <>
          {job.errors.length > 0 && (
            <div className="log-errors">
              {job.errors.map((e, i) => (
                <div key={i} className="log-error-line">
                  {e.line != null ? `line ${e.line}: ` : ""}
                  {e.message || e.raw}
                </div>
              ))}
            </div>
          )}
          <div className="log-scroll" ref={scrollRef}>
            {job.logLines.map((l, i) => (
              <div key={i} className={"log-line" + (/error|undefined control sequence|fatal/i.test(l) ? " err" : "")}>
                {l}
              </div>
            ))}
          </div>
          {Object.keys(job.artifacts).length > 0 && (
            <div className="artifacts">
              artifacts:{" "}
              {Object.entries(job.artifacts)
                .map(([k, v]) => `${k} (${v})`)
                .join(", ")}
            </div>
          )}
        </>
      )}
      {gearOpen && (
        <SettingsMenu
          x={gearOpen.x}
          y={gearOpen.y}
          title="Run log settings"
          controls={LOG_SETTINGS}
          values={settings}
          onChange={setSetting}
          onClose={() => setGearOpen(null)}
        />
      )}
    </div>
  );
}
