// "Fill with structure" modal (issue 43): pick a template, dry-run preview of
// exactly which files would be created (existing files are always left
// untouched), Apply, then an optional git commit / repository init.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { FillResult, Project, Template } from "../types";

interface Props {
  project: Project;
  templates: Template[];
  onClose: () => void;
  /** Called after Apply succeeds — the app refreshes the tree and .tex list. */
  onApplied: () => void;
}

export default function FillStructureModal({ project, templates, onClose, onApplied }: Props) {
  const [tplId, setTplId] = useState<string>(() => {
    if (project.template && templates.some((t) => t.id === project.template)) return project.template;
    return templates.find((t) => t.default)?.id ?? templates[0]?.id ?? "";
  });
  const [phase, setPhase] = useState<"preview" | "success">("preview");
  const [result, setResult] = useState<FillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Git state after an in-modal init (overrides the dry-run's snapshot). */
  const [gitState, setGitState] = useState<{ repo: boolean; initialized: boolean } | null>(null);
  const [gitMsg, setGitMsg] = useState("");
  const [committed, setCommitted] = useState(false);

  const loadPreview = useCallback(async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.fillProject(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (tplId) void loadPreview(tplId);
  }, [tplId, loadPreview]);

  const apply = async () => {
    if (!tplId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.fillProject(tplId, true);
      setResult(r);
      setGitMsg(`scaffold: fill with structure (${tplId})`);
      setPhase("success");
      onApplied();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const git = gitState ?? result?.git ?? null;
  const canCommit = !!git && git.repo && git.initialized;

  const initRepo = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.gitInit();
      setGitState(r.git);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!gitMsg.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.gitCommit(gitMsg.trim());
      setCommitted(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fill" onClick={(e) => e.stopPropagation()}>
        <div className="pane-header"><span>Fill with structure</span></div>
        <div className="modal-body">
          {phase === "preview" && (
            <>
              <select value={tplId} onChange={(e) => setTplId(e.target.value)} aria-label="Template">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {err && <div className="fill-warn">{err}</div>}
              {result?.warning && <div className="fill-warn">{result.warning}</div>}
              {busy && !result && <div className="muted">Checking the project…</div>}
              {result && (
                <>
                  {result.create.length === 0 ? (
                    <div className="muted">
                      This project already has every file from this template — nothing to do.
                    </div>
                  ) : (
                    <>
                      <div className="fill-group">
                        <h4>Will be created ({result.create.length})</h4>
                        <ul className="fill-list">
                          {result.create.map((f) => (
                            <li key={f} className="create">{f}</li>
                          ))}
                        </ul>
                      </div>
                      {result.skip.length > 0 && (
                        <div className="fill-group">
                          <h4>Left untouched ({result.skip.length})</h4>
                          <ul className="fill-list">
                            {result.skip.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="fill-actions">
                <button onClick={onClose}>Cancel</button>
                <button
                  className="primary"
                  disabled={!result || result.create.length === 0 || busy}
                  onClick={() => void apply()}
                >
                  {busy ? "Applying…" : `Add ${result?.create.length ?? 0} file${(result?.create.length ?? 0) === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
          {phase === "success" && (
            <>
              <div className="fill-done">
                <span className="tick">✓</span>
                Structure added to {project.name}.
              </div>
              {err && <div className="fill-warn">{err}</div>}
              {committed ? (
                <div className="muted">Committed.</div>
              ) : canCommit ? (
                <>
                  <input
                    value={gitMsg}
                    onChange={(e) => setGitMsg(e.target.value)}
                    aria-label="Commit message"
                    placeholder="commit message"
                  />
                  <div className="fill-actions">
                    <button onClick={onClose}>Done</button>
                    <button className="primary" disabled={!gitMsg.trim() || busy} onClick={() => void commit()}>
                      {busy ? "Committing…" : "Commit changes"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="muted">
                    This project is not a git repository yet. Nothing was initialized automatically.
                  </div>
                  <div className="fill-actions">
                    <button onClick={onClose}>Done</button>
                    <button className="primary" disabled={busy} onClick={() => void initRepo()}>
                      {busy ? "Initializing…" : "Initialize repository"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
