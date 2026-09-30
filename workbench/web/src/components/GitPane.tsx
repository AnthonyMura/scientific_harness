// Git module (issue 42): VS Code-style version control in the sidebar.
// Changes tab — branch header, staged/changes groups, commit box.
// History tab — newest-first log with expandable per-file diffs and checkout.
// All git work happens in the sidecar; this pane polls status (~3 s) and
// reacts to in-app file writes via the events bus (editor autosave).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type {
  GitBranchesResponse,
  GitCommit,
  GitCommitInfoResponse,
  GitDiffResponse,
  GitFileEntry,
  GitLogResponse,
  GitStatusResponse,
} from "../types";
import type { AppCtx } from "../modules/ctx";
import { onFileWritten } from "../modules/events";
import { useModuleSettings } from "../modules/settings";
import type { ModuleSettings, SettingControl } from "../modules/settings";
import SettingsMenu from "./SettingsMenu";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  GearIcon,
  GitBranchIcon,
  GitCommitIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "../icons";

export const GIT_SETTINGS: SettingControl[] = [
  {
    kind: "number",
    key: "pollSeconds",
    label: "Refresh interval",
    min: 2,
    max: 30,
    step: 1,
    unit: "s",
    hint: "How often the working tree is re-checked.",
  },
];

export const GIT_DEFAULTS: ModuleSettings = { pollSeconds: 3 };

const PAGE = 50; // history page size (issue 42: bounded fetch + load-more)

// ---------- small helpers -------------------------------------------------

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : "";
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** "2 h ago" style relative time for commit rows. */
function relTime(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(mo / 12)} y ago`;
}

// ---------- unified-diff renderer (dependency-free, issue 42) --------------

interface DiffLine {
  kind: "meta" | "hunk" | "add" | "del" | "ctx";
  text: string;
  noOld: number | null;
  noNew: number | null;
}

function parseUnified(text: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of text.split("\n")) {
    if (raw === "") continue; // trailing newline artifact
    if (raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("---") || raw.startsWith("+++")) {
      out.push({ kind: "meta", text: raw, noOld: null, noNew: null });
    } else if (raw.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      out.push({ kind: "hunk", text: raw, noOld: null, noNew: null });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), noOld: null, noNew: newNo++ });
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), noOld: oldNo++, noNew: null });
    } else {
      const t = raw.startsWith(" ") ? raw.slice(1) : raw;
      out.push({ kind: "ctx", text: t, noOld: oldNo++, noNew: newNo++ });
    }
  }
  return out;
}

const DIFF_MARKS: Record<DiffLine["kind"], string> = {
  meta: "",
  hunk: "",
  add: "+",
  del: "−",
  ctx: "",
};

/** Fetches and renders one unified diff (commit or worktree) inline. */
function DiffView({ kind, sha, file }: { kind: "commit" | "worktree"; sha?: string; file: string }) {
  const [st, setSt] = useState<{ binary?: boolean; text?: string; error?: string }>({});

  useEffect(() => {
    let alive = true;
    setSt({});
    const p = kind === "commit" && sha ? api.gitDiff(sha, file) : api.worktreeDiff(file);
    p
      .then((r: GitDiffResponse) => {
        if (alive) setSt(r.binary ? { binary: true } : { text: r.diff });
      })
      .catch((e) => {
        if (alive) setSt({ error: errMsg(e) });
      });
    return () => {
      alive = false;
    };
  }, [kind, sha, file]);

  if (st.error) return <div className="git-diff git-diff-error">{st.error}</div>;
  if (st.binary) return <div className="git-diff git-diff-binary">Binary files differ</div>;
  if (st.text === undefined) return <div className="git-diff git-diff-loading">Loading diff…</div>;

  const lines = parseUnified(st.text);
  return (
    <div className="git-diff" role="presentation">
      {lines.map((l, i) => (
        <div key={i} className={"dl dl-" + l.kind}>
          <span className="dl-no">{l.noOld ?? ""}</span>
          <span className="dl-no">{l.noNew ?? ""}</span>
          <span className="dl-mark">{DIFF_MARKS[l.kind]}</span>
          <span className="dl-text">{l.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- branch picker popover ------------------------------------------

interface BranchMenuProps {
  x: number;
  y: number;
  branches: GitBranchesResponse | null;
  onPick: (name: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}

function BranchMenu({ x, y, branches, onPick, onCreate, onClose }: BranchMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

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
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
  };

  return createPortal(
    <div className="menu git-branch-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {creating ? (
        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            placeholder="new-branch"
            onChange={(e) => setName(e.target.value)}
            aria-label="New branch name"
          />
          <div className="git-branch-actions">
            <button type="submit">Create</button>
            <button type="button" onClick={() => { setCreating(false); setName(""); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {(branches?.branches ?? []).map((b) => (
            <button key={b.name} className={"menu-item" + (b.current ? " current" : "")} onClick={() => onPick(b.name)}>
              {b.current ? (
                <span className="menu-item-icon">
                  <CheckIcon size={13} />
                </span>
              ) : (
                <span className="menu-item-icon git-branch-dot" />
              )}
              <span className="git-branch-name">{b.name}</span>
            </button>
          ))}
          {(!branches || branches.branches.length === 0) && <div className="menu-empty">No local branches</div>}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => setCreating(true)}>
            <span className="menu-item-icon">
              <PlusIcon size={13} />
            </span>
            New branch…
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

// ---------- confirm dialog state -------------------------------------------

type ConfirmState =
  | { kind: "discard"; path: string }
  | { kind: "switch"; name: string; dirty: boolean }
  | { kind: "checkout"; sha: string; short: string; subject: string; dirty: boolean };

// ---------- the pane ---------------------------------------------------------

export default function GitPane({ ctx }: { ctx: AppCtx }) {
  const [settings, setSetting] = useModuleSettings("git", GIT_DEFAULTS);
  const pollSeconds = typeof settings.pollSeconds === "number" ? settings.pollSeconds : 3;

  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [log, setLog] = useState<GitLogResponse | null>(null);
  const [logLimit, setLogLimit] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [commitMsg, setCommitMsg] = useState("");
  const [includeAll, setIncludeAll] = useState(false);

  const [gearOpen, setGearOpen] = useState<{ x: number; y: number } | null>(null);
  const [branchMenu, setBranchMenu] = useState<{ x: number; y: number } | null>(null);
  const [branches, setBranches] = useState<GitBranchesResponse | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // history expansion state
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [commitInfos, setCommitInfos] = useState<Record<string, GitCommitInfoResponse>>({});
  const [diffReq, setDiffReq] = useState<{ sha: string; file: string } | null>(null);

  // worktree diff expansion (changes tab)
  const [wtDiffFile, setWtDiffFile] = useState<string | null>(null);

  // ---------- data fetching ----------

  const refresh = useCallback(async () => {
    if (!ctx.projectRoot) return;
    setRefreshing(true);
    try {
      const [st, lg] = await Promise.all([api.gitStatus(), api.gitLog(logLimit, 0)]);
      setStatus(st);
      setLog(lg);
      setLastRefresh(Date.now());
    } catch {
      // transient poll failure — the refresh indicator stays put; mutations surface their own errors
    } finally {
      setRefreshing(false);
    }
  }, [ctx.projectRoot, logLimit]);

  // Poll while a project is open; also react (debounced) to in-app file writes.
  useEffect(() => {
    if (!ctx.projectOpen || !ctx.projectRoot) return;
    void refresh();
    const iv = window.setInterval(() => void refresh(), Math.max(2, pollSeconds) * 1000);
    let writeTimer: number | null = null;
    const off = onFileWritten(() => {
      if (writeTimer !== null) window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => void refresh(), 400);
    });
    return () => {
      window.clearInterval(iv);
      if (writeTimer !== null) window.clearTimeout(writeTimer);
      off();
    };
  }, [ctx.projectOpen, ctx.projectRoot, pollSeconds, refresh]);

  // Reset pane state when the project changes.
  useEffect(() => {
    setStatus(null);
    setLog(null);
    setLogLimit(PAGE);
    setLastRefresh(null);
    setActionError(null);
    setExpandedSha(null);
    setCommitInfos({});
    setDiffReq(null);
    setWtDiffFile(null);
    setTab("changes"); // a new project starts on the Changes view
  }, [ctx.projectRoot]);

  // ---------- mutations ----------

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const doInit = () => {
    void run("init", async () => {
      // Plain `git init` (no baseline commit) — the spec's empty state then
      // offers making the first commit via the commit box below.
      await api.gitInit(undefined, false);
      ctx.bumpTree();
    });
  };

  const doCommit = () => {
    const msg = commitMsg.trim();
    if (!msg || busy) return;
    void run("commit", async () => {
      await api.gitCommit(msg, includeAll);
      setCommitMsg("");
    });
  };

  const stage = (paths: string[]) => void run("stage", () => api.gitStage(paths));
  const unstage = (paths: string[]) => void run("unstage", () => api.gitUnstage(paths));

  const doDiscard = () => {
    if (!confirm || confirm.kind !== "discard") return;
    const path = confirm.path;
    setConfirm(null);
    void run("discard", async () => {
      await api.gitDiscard([path]);
      ctx.bumpTree();
    });
  };

  const pickBranch = (name: string) => {
    setBranchMenu(null);
    const st = status;
    if (!st || !st.repo || name === st.branch) return;
    const dirty = st.staged.length + st.changes.length > 0;
    setConfirm({ kind: "switch", name, dirty });
  };

  const doSwitch = () => {
    if (!confirm || confirm.kind !== "switch") return;
    const name = confirm.name;
    setConfirm(null);
    void run("switch", async () => {
      await api.gitSwitch(name);
      ctx.bumpTree();
    });
  };

  const openBranchMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBranchMenu({ x: r.left, y: r.bottom + 4 });
    void api
      .gitBranches()
      .then(setBranches)
      .catch(() => setBranches(null));
  };

  const doCreateBranch = (name: string) => {
    setBranchMenu(null);
    void run("branch", () => api.gitCreateBranch(name));
  };

  const askCheckout = (c: GitCommit) => {
    const st = status;
    const dirty = st ? st.staged.length + st.changes.length > 0 : false;
    setConfirm({ kind: "checkout", sha: c.sha, short: c.short, subject: c.subject, dirty });
  };

  const doCheckout = () => {
    if (!confirm || confirm.kind !== "checkout") return;
    const sha = confirm.sha;
    setConfirm(null);
    void run("checkout", async () => {
      await api.gitCheckout(sha);
      ctx.bumpTree();
    });
  };

  // ---------- history expansion ----------

  const toggleCommit = (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null);
      setDiffReq(null);
      return;
    }
    setExpandedSha(sha);
    setDiffReq(null);
    if (!commitInfos[sha]) {
      void api
        .gitCommitInfo(sha)
        .then((info) => setCommitInfos((prev) => ({ ...prev, [sha]: info })))
        .catch((e) => setActionError(errMsg(e)));
    }
  };

  const loadMore = () => {
    if (busy) return;
    setLogLimit((l) => l + PAGE); // next poll (and this one) fetches the bigger window
  };

  // ---------- derived ----------

  const dirtyCount = status ? status.staged.length + status.changes.length : 0;
  const ago = lastRefresh !== null ? Math.max(0, Math.floor((Date.now() - lastRefresh) / 1000)) : null;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  // ---------- render: file rows (changes tab) ----------

  const renderFileRow = (entry: GitFileEntry, staged: boolean) => {
    const diffOpen = wtDiffFile === entry.path;
    return (
      <React.Fragment key={entry.path + (staged ? ":s" : ":c")}>
        <div className="tree-row git-file" title={entry.path} onClick={() => ctx.onOpenFile(entry.path)}>
          <span className={"git-badge " + entry.badge.toLowerCase()}>{entry.badge}</span>
          <span className="git-file-name">{baseName(entry.path)}</span>
          {parentDir(entry.path) && <span className="git-file-dir muted">{parentDir(entry.path)}</span>}
          <span className="row-actions">
            {staged ? (
              <button type="button" title="Unstage" onClick={stop(() => unstage([entry.path]))}>
                <MinusIcon size={13} />
              </button>
            ) : (
              <button type="button" title="Stage" onClick={stop(() => stage([entry.path]))}>
                <PlusIcon size={13} />
              </button>
            )}
            {!staged && (
              <button
                type="button"
                className="danger"
                title="Discard changes (destructive)"
                onClick={stop(() => setConfirm({ kind: "discard", path: entry.path }))}
              >
                <TrashIcon size={13} />
              </button>
            )}
            <button type="button" title="Open diff (HEAD vs worktree)" onClick={stop(() => setWtDiffFile(diffOpen ? null : entry.path))}>
              <CodeIcon size={13} />
            </button>
            <button type="button" title="Open in editor" onClick={stop(() => ctx.onOpenFile(entry.path))}>
              <PencilIcon size={13} />
            </button>
          </span>
        </div>
        {diffOpen && <DiffView kind="worktree" file={entry.path} />}
      </React.Fragment>
    );
  };

  // ---------- render: history rows ----------

  const renderCommitRow = (c: GitCommit) => {
    const expanded = expandedSha === c.sha;
    const info = commitInfos[c.sha];
    return (
      <div key={c.sha} className="git-log-item">
        <div className={"tree-row git-log-row" + (expanded ? " active" : "")} onClick={() => toggleCommit(c.sha)}>
          <span className="git-chev">
            {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
          <span className="mono git-sha">{c.short}</span>
          <span className="git-subject" title={c.subject}>
            {c.subject}
          </span>
        </div>
        <div className="git-log-meta muted">
          <span>{c.author}</span>
          <span>·</span>
          <span>{relTime(c.ts)}</span>
          {c.refs.map((r) => (
            <span key={r} className="badge git-ref" title={r}>
              {r}
            </span>
          ))}
        </div>
        {expanded && (
          <div className="git-commit-detail">
            {info ? (
              <>
                {c.body && <pre className="git-body">{c.body}</pre>}
                <div className="git-files-head muted">
                  {info.files.length} file{info.files.length === 1 ? "" : "s"} changed
                </div>
                {info.files.map((f) => (
                  <div
                    key={f.path + (f.from ?? "")}
                    className={"tree-row git-file" + (diffReq && diffReq.sha === c.sha && diffReq.file === f.path ? " active" : "")}
                    onClick={() => setDiffReq({ sha: c.sha, file: f.path })}
                  >
                    <span className="git-file-name">{baseName(f.path)}</span>
                    {f.from && <span className="muted">← {baseName(f.from)}</span>}
                    {parentDir(f.path) && <span className="git-file-dir muted">{parentDir(f.path)}</span>}
                    <span className="spacer" />
                    {f.binary ? (
                      <span className="muted git-binary-tag">binary</span>
                    ) : (
                      <span className="mono git-numstat">
                        <span className="git-add">+{f.added}</span> <span className="git-del">−{f.removed}</span>
                      </span>
                    )}
                  </div>
                ))}
                {diffReq && diffReq.sha === c.sha && <DiffView kind="commit" sha={c.sha} file={diffReq.file} />}
              </>
            ) : (
              <div className="muted git-loading">Loading commit…</div>
            )}
            <div className="card-actions git-checkout-row">
              <button type="button" onClick={() => askCheckout(c)} disabled={busy !== null}>
                <GitCommitIcon size={13} /> Checkout {c.short}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---------- render: empty states ----------

  const renderChangesBody = () => {
    if (!status) return <div className="pane-empty">Loading…</div>;
    if (!status.git) {
      return (
        <div className="pane-empty git-empty">
          <div>git is not installed on this machine.</div>
          <div className="hint">
            Install it, e.g. <code className="cmd">sudo apt install git</code>, then reopen the project.
          </div>
        </div>
      );
    }
    if (!status.repo) {
      return (
        <div className="pane-empty git-empty">
          <div>This project is not a git repository.</div>
          <div className="hint">Initialize one to track changes and keep a history.</div>
          <div className="card-actions">
            <button type="button" className="primary" onClick={doInit} disabled={busy !== null}>
              {busy === "init" ? "Initializing…" : "Initialize repository"}
            </button>
          </div>
        </div>
      );
    }
    const clean = status.staged.length === 0 && status.changes.length === 0;
    return (
      <>
        {status.staged.length > 0 && (
          <div className="git-group">
            <div className="git-group-head muted">Staged ({status.staged.length})</div>
            {status.staged.map((e) => renderFileRow(e, true))}
          </div>
        )}
        {status.changes.length > 0 && (
          <div className="git-group">
            <div className="git-group-head muted">Changes ({status.changes.length})</div>
            {status.changes.map((e) => renderFileRow(e, false))}
          </div>
        )}
        {clean && <div className="pane-empty git-clean">Working tree clean</div>}
      </>
    );
  };

  const renderHistoryBody = () => {
    if (!status?.repo) return <div className="pane-empty">No repository.</div>;
    if (!log || log.total === 0) return <div className="pane-empty git-clean">No commits yet — stage files and make your first commit in the Changes tab.</div>;
    return (
      <>
        {log.commits.map(renderCommitRow)}
        {log.commits.length < log.total && (
          <button type="button" className="git-load-more" onClick={loadMore} disabled={busy !== null}>
            Load more ({log.total - log.commits.length} older)
          </button>
        )}
      </>
    );
  };

  // ---------- render: root ----------

  return (
    <div className="git-pane">
      <div className="pane-header">
        <span>Git</span>
        <span className="head-actions">
          <button type="button" title="Refresh now" onClick={() => void refresh()}>
            <RefreshIcon size={14} className={refreshing ? "git-spin" : ""} />
          </button>
          {ago !== null && (
            <span className="git-ago muted" title="Seconds since last refresh">
              {ago}s
            </span>
          )}
        </span>
        <button
          type="button"
          className="head-gear"
          title="Git settings (refresh interval)"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGearOpen({ x: r.right, y: r.bottom + 4 });
          }}
        >
          <GearIcon size={14} />
        </button>
      </div>

      {status?.repo && (
        <div className="git-context">
          <button type="button" className="git-branch-btn" onClick={openBranchMenu} title="Switch branch">
            <GitBranchIcon size={13} />
            {status.detached ? (
              <span className="mono">{status.head ?? "detached"}</span>
            ) : (
              <span>{status.branch ?? "(none)"}</span>
            )}
            {status.detached && <span className="muted git-detached">detached</span>}
            <ChevronDownIcon size={12} />
          </button>
          {status.upstream !== null && (
            <span className="mono git-ab" title={`Upstream ${status.upstream}: ${status.ahead} ahead, ${status.behind} behind`}>
              ↑{status.ahead}
              <span className="muted">/</span>↓{status.behind}
            </span>
          )}
          <span className="spacer" />
          {status.remotes.map((r) => (
            <span key={r.name} className="git-remote muted" title={r.url}>
              {r.name}
            </span>
          ))}
        </div>
      )}

      {status?.repo && (
        <div className="git-tabs">
          <button type="button" className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
            Changes{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </button>
          <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            History
          </button>
        </div>
      )}

      {actionError && <div className="tree-error git-error">{actionError}</div>}

      <div className="tree-scroll">
        {tab === "changes" ? renderChangesBody() : renderHistoryBody()}
      </div>

      {status?.repo && tab === "changes" && (
        <div className="git-commit-box">
          <textarea
            className="git-msg"
            rows={3}
            placeholder={status.initialized ? "Commit message (staged changes)" : "First commit message"}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
          />
          <label className="git-include-all">
            <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
            include all changes
          </label>
          <div className="card-actions">
            <button type="button" className="primary" disabled={!commitMsg.trim() || busy !== null} onClick={doCommit}>
              {busy === "commit" ? "Committing…" : "Commit"}
            </button>
          </div>
        </div>
      )}

      {gearOpen && (
        <SettingsMenu x={gearOpen.x} y={gearOpen.y} title="Git settings" controls={GIT_SETTINGS} values={settings} onChange={setSetting} onClose={() => setGearOpen(null)} />
      )}
      {branchMenu && (
        <BranchMenu x={branchMenu.x} y={branchMenu.y} branches={branches} onPick={pickBranch} onCreate={doCreateBranch} onClose={() => setBranchMenu(null)} />
      )}

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="pane-header">
              <span>
                {confirm.kind === "discard" ? "Discard changes" : confirm.kind === "switch" ? "Switch branch" : "Checkout commit"}
              </span>
            </div>
            <div className="modal-body">
              {confirm.kind === "discard" && (
                <div>
                  Discard local changes to <code>{confirm.path}</code>? This cannot be undone.
                </div>
              )}
              {confirm.kind === "switch" && (
                <div>
                  Switch to branch <code>{confirm.name}</code>?
                  {confirm.dirty && " You have uncommitted changes — they will carry over if the switch is clean, or block it."}
                </div>
              )}
              {confirm.kind === "checkout" && (
                <div>
                  Checkout <code className="mono">{confirm.short}</code> (“{confirm.subject}”)? HEAD moves to this commit in a{" "}
                  <em>detached</em> state.
                  {confirm.dirty && " Uncommitted changes may be lost if they conflict."}
                </div>
              )}
              <div className="card-actions">
                <button onClick={() => setConfirm(null)}>Cancel</button>
                <button className="danger" onClick={confirm.kind === "switch" ? doSwitch : confirm.kind === "checkout" ? doCheckout : doDiscard}>
                  {confirm.kind === "discard" ? "Discard" : confirm.kind === "switch" ? "Switch" : "Checkout"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
