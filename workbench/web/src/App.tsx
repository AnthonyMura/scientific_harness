// App shell: top bar + module workbench. Owns project state, job polling and
// the layout reducer; hands every module a shared AppCtx.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, initApi } from "./api";
import type { ActiveJob, Project, SshConfig, TargetStatus } from "./types";
import ProjectBar from "./components/ProjectBar";
import Workbench from "./components/Workbench";
import type { AppCtx, SyncRequest } from "./modules/ctx";
import { findParent, groupOfTab, layoutReducer, loadPersistedLayout, persistLayout } from "./modules/layout";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  const [devMode, setDevMode] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [recent, setRecent] = useState<Project[]>([]);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [showOpen, setShowOpen] = useState(false);
  const [openPath, setOpenPath] = useState("");
  const [pdfVersion, setPdfVersion] = useState(0);
  const [pdfSync, setPdfSync] = useState<SyncRequest | null>(null);
  const [editorGoto, setEditorGoto] = useState<SyncRequest | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  /** Static PDF open in the PDF pane (null = compiled main.pdf output). */
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  // Compile-target selector (M3): probe results + a tick that re-probes
  // after every install job settles.
  const [targetStatuses, setTargetStatuses] = useState<TargetStatus[] | null>(null);
  const [installTick, setInstallTick] = useState(0);
  const offsetRef = useRef(0);
  const finishedRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  // Auto-compile on save (M3): compilingRef guards the async start gap;
  // autoPendingRef coalesces saves that arrive while a compile is running.
  const compilingRef = useRef(false);
  const autoPendingRef = useRef(false);

  const [layout, dispatch] = useReducer(layoutReducer, undefined, () => loadPersistedLayout().state);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const jobRef = useRef(job);
  jobRef.current = job;

  // Persist open tabs + geometry with the last opened project root.
  useEffect(() => {
    persistLayout(layout, project?.root ?? null);
  }, [layout, project]);

  // A statically opened PDF belongs to the previous project's tree.
  useEffect(() => {
    setPdfFile(null);
  }, [project?.root]);

  /** Open (or focus) the default set of modules for a project. */
  // Default template: explorer in the sidebar, editor in the center pane; PDF,
  // Run Log and Install open on demand into their home panes (bottom panel).
  const openDefaultTabs = useCallback((p: Project | null) => {
    dispatch({ type: "open", moduleId: "explorer" });
    if (p) dispatch({ type: "open", moduleId: "editor", params: { filePath: p.main_file } });
    else dispatch({ type: "open", moduleId: "editor" });
  }, []);

  const bootLayout = useCallback(
    (p: Project | null) => {
      const persisted = loadPersistedLayout();
      const keepTabs = p !== null && persisted.root === p.root && Object.keys(persisted.state.tabs).length > 0;
      if (!keepTabs) dispatch({ type: "resetTabs" });
      openDefaultTabs(p);
    },
    [openDefaultTabs],
  );

  useEffect(() => {
    (async () => {
      try {
        const c = await initApi();
        setDevMode(c.devMode);
        await api.health();
        const cur = await api.currentProject();
        if (cur.project) setProject(cur.project);
        const rec = await api.recentProjects();
        setRecent(rec.projects);
        bootLayout(cur.project ?? null);
      } catch (e) {
        setBanner("Cannot reach the workbench backend — " + errMsg(e));
        openDefaultTabs(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the active job (compile or install) while it runs.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const jobId = job.id;
    const t = setInterval(async () => {
      try {
        const snap = await api.jobStatus(jobId, offsetRef.current);
        if (activeJobIdRef.current !== jobId) return; // a newer job took over
        offsetRef.current = snap.total_lines;
        if (snap.status !== "running" && finishedRef.current !== jobId) {
          finishedRef.current = jobId;
          if (snap.kind === "compile") {
            compilingRef.current = false;
            if (snap.artifacts.pdf) setPdfVersion((v) => v + 1);
            // A failed compile keeps the old PDF — bring the log forward so the
            // reason is visible instead of hidden behind the PDF tab.
            if (snap.status !== "done") dispatch({ type: "open", moduleId: "log" });
            // A save arrived while this compile ran: run it once more.
            if (autoPendingRef.current) {
              autoPendingRef.current = false;
              void compileRef.current(true);
            }
          }
          if (snap.kind === "install") setInstallTick((t) => t + 1); // re-probe targets
        }
        setJob((prev) =>
          prev && prev.id === jobId
            ? {
                ...prev,
                status: snap.status,
                exit_code: snap.exit_code,
                logLines: [...prev.logLines, ...snap.log],
                errors: snap.errors,
                artifacts: snap.artifacts,
              }
            : prev,
        );
      } catch {
        // transient error — keep polling
      }
    }, 700);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  // Probe compile targets for the top-bar selector: on project open and
  // after every install job settles.
  useEffect(() => {
    if (!project) {
      setTargetStatuses(null);
      return;
    }
    let alive = true;
    void api
      .installStatus()
      .then((r) => {
        if (alive) setTargetStatuses(r.targets);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project?.root, installTick]);

  const refreshRecent = async () => {
    try {
      setRecent((await api.recentProjects()).projects);
    } catch {
      // ignore
    }
  };

  const doOpenProject = async (path: string) => {
    try {
      const p = await api.openProject(path);
      setProject(p);
      dispatch({ type: "resetTabs" });
      openDefaultTabs(p);
      void refreshRecent();
    } catch (e) {
      setBanner(errMsg(e));
    }
  };

  // Electron: native OS folder dialog. Browser (primary dev surface): inline
  // modal with a path input — no window.prompt.
  const openFolder = async () => {
    if (window.workbench?.openFolderDialog) {
      const path = await window.workbench.openFolderDialog();
      if (path) void doOpenProject(path);
    } else {
      setOpenPath("");
      setShowOpen(true);
    }
  };

  const submitOpen = () => {
    const p = openPath.trim();
    if (!p) return;
    setShowOpen(false);
    void doOpenProject(p);
  };

  const createNew = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const p = await api.newProject(name);
      setProject(p);
      dispatch({ type: "resetTabs" });
      openDefaultTabs(p);
      setShowNew(false);
      setNewName("");
      void refreshRecent();
    } catch (e) {
      setBanner(errMsg(e));
    }
  };

  const pickRecent = async (p: Project) => {
    try {
      const opened = await api.openProject(p.root);
      setProject(opened);
      dispatch({ type: "resetTabs" });
      openDefaultTabs(opened);
    } catch (e) {
      setBanner(errMsg(e));
    }
  };

  /** PDF pane for compile jobs: keep it as the right-hand sibling of the active
   *  editor — focus it if it is already there, otherwise place (or move) it. */
  const openPdfPane = useCallback(() => {
    const st = layoutRef.current;
    let g = st.lastEditor ? groupOfTab(st, st.lastEditor) : null;
    if (!g) {
      const fg = st.focusedGroup ? st.nodes[st.focusedGroup] : null;
      g = fg && fg.kind === "group" ? fg.id : null;
    }
    if (!g) {
      dispatch({ type: "open", moduleId: "pdf" });
      return;
    }
    const pdfGroup = st.tabs["pdf"] ? groupOfTab(st, "pdf") : null;
    if (pdfGroup) {
      const p = findParent(st.nodes, st.rootId, g);
      // Already the right-hand sibling of this editor group — just focus it.
      if (p && p.split.dir === "h" && p.split.b === pdfGroup) {
        dispatch({ type: "open", moduleId: "pdf" });
        return;
      }
    }
    dispatch(
      st.tabs["pdf"]
        ? { type: "split", groupId: g, dir: "h", side: "after", withTabId: "pdf" }
        : { type: "split", groupId: g, dir: "h", side: "after", withModuleId: "pdf" },
    );
  }, []);

  const beginJob = (id: string, kind: "compile" | "install", label: string) => {
    offsetRef.current = 0;
    finishedRef.current = null;
    activeJobIdRef.current = id;
    dispatch({ type: "open", moduleId: "log" }); // show the run log while a job runs
    if (kind === "compile") openPdfPane(); // compile controls live in the PDF pane
    setJob({ id, kind, label, status: "running", exit_code: null, logLines: [], errors: [], artifacts: {} });
  };

  const compile = async (auto = false) => {
    if (!project || compilingRef.current) return;
    compilingRef.current = true;
    try {
      const r = await api.startCompile(project.main_file, project.target);
      beginJob(
        r.job_id,
        "compile",
        auto ? `auto-compiling ${project.name} after save` : `compiling ${project.name}`,
      );
    } catch (e) {
      compilingRef.current = false; // start failed — allow a retry
      setBanner(errMsg(e));
    }
  };
  const compileRef = useRef<(auto?: boolean) => Promise<void>>(() => Promise.resolve());
  compileRef.current = compile;

  /** A .tex file was saved: kick off (or queue) an auto-compile. */
  const onFileSaved = useCallback(
    (path: string) => {
      if (!project || !path.endsWith(".tex") || !project.auto_compile) return;
      const j = jobRef.current;
      if (compilingRef.current || (j && j.kind === "compile" && j.status === "running")) {
        autoPendingRef.current = true; // coalesce: one follow-up run on finish
        return;
      }
      void compile(true);
    },
    [project, compile],
  );

  const setAutoCompile = useCallback(
    async (on: boolean) => {
      if (!project) return;
      try {
        await api.setConfig({ project: { auto_compile: on } });
        setProject((p) => (p ? { ...p, auto_compile: on } : p));
      } catch (e) {
        setBanner(errMsg(e));
      }
    },
    [project],
  );

  const setTarget = useCallback(
    async (target: string) => {
      if (!project) return;
      try {
        await api.setConfig({ project: { target } });
        setProject((p) => (p ? { ...p, target } : p));
      } catch (e) {
        setBanner(errMsg(e));
      }
    },
    [project],
  );

  const saveSsh = useCallback(
    async (cfg: SshConfig) => {
      if (!project) return;
      try {
        await api.setConfig({ project: { ssh: cfg } });
        setProject((p) => (p ? { ...p, ssh: cfg } : p));
      } catch (e) {
        setBanner(errMsg(e));
      }
    },
    [project],
  );

  const startInstall = useCallback(async (target: string, distro?: string) => {
    try {
      const r = await api.startInstall(target, distro);
      beginJob(r.job_id, "install", `installing TeX (${target})`);
    } catch (e) {
      setBanner(errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelJob = useCallback(async () => {
    const j = jobRef.current;
    if (!j) return;
    try {
      await api.cancelJob(j.id);
    } catch (e) {
      setBanner(errMsg(e));
    }
  }, []);

  // --- module context -----------------------------------------------------

  const activeFile = useMemo(() => {
    const id = layout.lastEditor;
    if (!id) return null;
    const t = layout.tabs[id];
    if (t?.moduleId !== "editor") return null;
    return t.params?.filePath ? String(t.params.filePath) : null;
  }, [layout]);

  /** The focused pane's active tab is an editor tab (the "activated editor"). */
  const editorFocused = useMemo(() => {
    const fg = layout.focusedGroup;
    if (!fg) return false;
    const g = layout.nodes[fg];
    if (!g || g.kind !== "group" || !g.active) return false;
    return layout.tabs[g.active]?.moduleId === "editor";
  }, [layout]);

  const onOpenFile = useCallback((path: string) => {
    // Reuse the focused pane's empty editor tab instead of stacking a second one.
    const st = layoutRef.current;
    if (!st.tabs["editor:" + path]) {
      const g = st.focusedGroup ? st.nodes[st.focusedGroup] : null;
      if (g?.kind === "group" && g.active) {
        const t = st.tabs[g.active];
        if (t?.moduleId === "editor" && !t.params?.filePath) {
          dispatch({ type: "attachFile", tabId: t.id, filePath: path });
          return;
        }
      }
    }
    dispatch({ type: "open", moduleId: "editor", params: { filePath: path } });
  }, []);

  const onOpenPdf = useCallback((path: string) => {
    setPdfFile(path);
    dispatch({ type: "open", moduleId: "pdf" });
  }, []);

  const onShowMainPdf = useCallback(() => {
    setPdfFile(null);
    dispatch({ type: "open", moduleId: "pdf" });
  }, []);

  const onShowInstall = useCallback(() => {
    dispatch({ type: "open", moduleId: "install" });
  }, []);

  const onShowLog = useCallback(() => {
    dispatch({ type: "open", moduleId: "log" });
  }, []);

  const onPathsGone = useCallback((prefixes: string[]) => {
    const gone = (fp: string) => prefixes.some((p) => fp === p || fp.startsWith(p + "/"));
    for (const t of Object.values(layoutRef.current.tabs)) {
      if (t.moduleId !== "editor") continue;
      const fp = t.params?.filePath ? String(t.params.filePath) : null;
      if (fp && gone(fp)) dispatch({ type: "close", tabId: t.id });
    }
    setPdfFile((cur) => (cur && gone(cur) ? null : cur)); // drop a deleted static PDF
  }, []);

  const onFileRenamed = useCallback((oldPath: string, newPath: string) => {
    const oldId = "editor:" + oldPath;
    if (!layoutRef.current.tabs[oldId]) return;
    dispatch({ type: "retab", oldId, newId: "editor:" + newPath, title: newPath.split("/").pop() || newPath });
  }, []);

  // --- SyncTeX channels (M3): editor click → PDF jump; PDF click → line.
  const syncToPdf = useCallback((file: string, line: number) => {
    setPdfFile(null); // forward search targets the compiled output
    setPdfSync((s) => ({ file, line, nonce: (s?.nonce ?? 0) + 1 }));
  }, []);

  const syncToEditor = useCallback(
    (file: string, line: number) => {
      onOpenFile(file);
      setEditorGoto((s) => ({ file, line, nonce: (s?.nonce ?? 0) + 1 }));
    },
    [onOpenFile],
  );

  const ctx: AppCtx = useMemo(
    () => ({
      projectOpen: !!project,
      projectRoot: project?.root ?? null,
      activeFile,
      editorFocused,
      project,
      pdfFile,
      onOpenPdf,
      onShowMainPdf,
      onCompile: () => void compile(),
      autoCompile: !!project?.auto_compile,
      onAutoCompile: (on) => void setAutoCompile(on),
      targetStatuses,
      onTarget: (t) => void setTarget(t),
      onSaveSsh: saveSsh,
      onShowInstall,
      onShowLog,
      pdfVersion,
      job,
      onOpenFile,
      onCancelJob: () => void cancelJob(),
      onStartInstall: (t, d) => void startInstall(t, d),
      onPathsGone,
      onFileRenamed,
      pdfSync,
      editorGoto,
      syncToPdf,
      syncToEditor,
      onFileSaved,
    }),
    [project, activeFile, editorFocused, pdfFile, onOpenPdf, onShowMainPdf, targetStatuses, onShowInstall, onShowLog,
     setAutoCompile, setTarget, saveSsh,
     pdfVersion, job, onOpenFile, cancelJob, startInstall, onPathsGone, onFileRenamed,
     pdfSync, editorGoto, syncToPdf, syncToEditor, onFileSaved],
  );

  return (
    <div className="app">
      <ProjectBar
        project={project}
        recent={recent}
        devMode={devMode}
        onOpenFolder={() => void openFolder()}
        onNewProject={() => setShowNew(true)}
        onPickRecent={(p) => void pickRecent(p)}
        showInstall={false}
        onToggleInstall={() => dispatch({ type: "open", moduleId: "install" })}
      />
      <Workbench layout={layout} dispatch={dispatch} ctx={ctx} />
      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="pane-header"><span>New project</span></div>
            <div className="modal-body">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createNew();
                }}
                placeholder="Project name"
              />
              <div className="muted">
                Created under ~/Documents/Workbench with the classic template.
              </div>
              <div className="card-actions">
                <button onClick={() => setShowNew(false)}>Cancel</button>
                <button className="primary" disabled={!newName.trim()} onClick={() => void createNew()}>
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showOpen && (
        <div className="modal-backdrop" onClick={() => setShowOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="pane-header"><span>Open project</span></div>
            <div className="modal-body">
              <input
                autoFocus
                value={openPath}
                onChange={(e) => setOpenPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitOpen();
                }}
                placeholder="/home/nk/code/my-manuscript"
              />
              <div className="muted">
                Absolute path to the project folder on this machine. Recent
                projects are available in the top bar.
              </div>
              <div className="card-actions">
                <button onClick={() => setShowOpen(false)}>Cancel</button>
                <button className="primary" disabled={!openPath.trim()} onClick={submitOpen}>
                  Open
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {banner && (
        <div className="banner" onClick={() => setBanner(null)}>
          {banner}
        </div>
      )}
    </div>
  );
}
