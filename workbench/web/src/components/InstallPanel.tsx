// Install TeX module: probes targets, shows what is missing and starts installs.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { TargetStatus } from "../types";
import type { AppCtx } from "../modules/ctx";

interface Props {
  ctx: AppCtx;
}

export default function InstallPanel({ ctx }: Props) {
  const [targets, setTargets] = useState<TargetStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distroPick, setDistroPick] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const r = await api.installStatus();
      setTargets(r.targets);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [ctx.job?.status, refresh]);

  const installing = !!ctx.job && ctx.job.kind === "install" && ctx.job.status === "running";

  return (
    <div className="install-content">
      <div className="pane-header">
        <span>Install TeX</span>
        <button className="mini" onClick={() => void refresh()}>Refresh</button>
      </div>
      {error && <div className="tree-error">{error}</div>}
      {!targets ? (
        <div className="pane-empty">Probing targets…</div>
      ) : (
        <div className="install-cards">
          {targets.map((t) => (
            <div key={t.name} className={"card" + (t.tex_found && t.missing.length === 0 ? " ok" : "")}>
              <div className="card-title">
                <span>{t.name}</span>
                <span className={"chip " + (t.tex_found ? "done" : t.available ? "cancelled" : "error")}>
                  {t.tex_found ? "TeX found" : t.available ? "missing" : "unavailable"}
                </span>
              </div>
              <div className="muted">{t.detail}</div>
              {t.version && <div className="muted mono">{t.version}</div>}
              {t.missing.length > 0 && (
                <ul className="missing">
                  {t.missing.map((m) => (
                    <li key={m.file}>
                      {m.file} — needs <code>{m.package}</code>
                    </li>
                  ))}
                </ul>
              )}
              {t.can_install && !installing && (
                <>
                  <div className="hint">{t.install_hint}</div>
                  <pre className="cmd">{t.install_command}</pre>
                  <div className="card-actions">
                    {t.distros.length > 0 && (
                      <select
                        value={distroPick[t.name] ?? ""}
                        onChange={(e) => setDistroPick((p) => ({ ...p, [t.name]: e.target.value }))}
                      >
                        <option value="">default distro</option>
                        {t.distros.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    )}
                    <button className="primary" onClick={() => ctx.onStartInstall(t.name, distroPick[t.name] || undefined)}>
                      Install now
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {installing && (
        <div className="muted" style={{ padding: "0 12px 12px" }}>
          Install running — watch the Run Log module.
        </div>
      )}
    </div>
  );
}
