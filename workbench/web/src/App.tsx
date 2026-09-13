// App shell: top bar + module workbench. Owns project state, job polling and
// the layout reducer; hands every module a shared AppCtx.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, initApi } from "./api";
import type { ActiveJob, Project } from "./types";
import ProjectBar from "./components/ProjectBar";
import Workbench from "./components/Workbench";
import type { AppCtx, SyncRequest } from "./modules/ctx";
import { layoutReducer, loadPersistedLayout, persistLayout } from "./modules/layout";

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
  const offsetRef = useRef(0);
  const finishedRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const [layout, dispatch] = useReducer(layoutReducer, undefined, () => loadPersistedLayout().state);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const jobRef = useRef(job);
  jobRef.current = job;

  // Persist open tabs + geometry with the last opened project root.
  useEffect(() => {
    persistLayout(layout, project?.root ?? null);
  }, [layout, project]);

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
          if (snap.kind === "compile" && snap.artifacts.pdf) setPdfVersion((v) => v + 1);
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

  const beginJob = (id: string, kind: "compile" | "install", label: string) => {
    offsetRef.current = 0;
    finishedRef.current = null;
    activeJobIdRef.current = id;
    dispatch({ type: "open", moduleId: "log" }); // show the run log while a job runs
    setJob({ id, kind, label, status: "running", exit_code: null, logLines: [], errors: [], artifacts: {} });
  };

  const compile = async () => {
    if (!project) return;
    try {
      const r = await api.startCompile(project.main_file, project.target);
      beginJob(r.job_id, "compile", `compiling ${project.name}`);
    } catch (e) {
      setBanner(errMsg(e));
    }
  };

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

  const onOpenFile = useCallback((path: string) => {
    dispatch({ type: "open", moduleId: "editor", params: { filePath: path } });
  }, []);

  const onPathsGone = useCallback((prefixes: string[]) => {
    const gone = (fp: string) => prefixes.some((p) => fp === p || fp.startsWith(p + "/"));
    for (const t of Object.values(layoutRef.current.tabs)) {
      if (t.moduleId !== "editor") continue;
      const fp = t.params?.filePath ? String(t.params.filePath) : null;
      if (fp && gone(fp)) dispatch({ type: "close", tabId: t.id });
    }
  }, []);

  const onFileRenamed = useCallback((oldPath: string, newPath: string) => {
    const oldId = "editor:" + oldPath;
    if (!layoutRef.current.tabs[oldId]) return;
    dispatch({ type: "retab", oldId, newId: "editor:" + newPath, title: newPath.split("/").pop() || newPath });
  }, []);

  // --- SyncTeX channels (M3): editor click → PDF jump; PDF click → line.
  const syncToPdf = useCallback((file: string, line: number) => {
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
    }),
    [project, activeFile, pdfVersion, job, onOpenFile, cancelJob, startInstall, onPathsGone, onFileRenamed,
     pdfSync, editorGoto, syncToPdf, syncToEditor],
  );

  return (
    <div className="app">
      <ProjectBar
        project={project}
        recent={recent}
        devMode={devMode}
        jobRunning={!!job && job.status === "running"}
        onOpenFolder={() => void openFolder()}
        onNewProject={() => setShowNew(true)}
        onPickRecent={(p) => void pickRecent(p)}
        onCompile={() => void compile()}
        onCancelJob={() => void cancelJob()}
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
