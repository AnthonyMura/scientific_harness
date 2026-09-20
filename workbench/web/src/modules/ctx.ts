// Shared application context handed to every module render.
import type { ActiveJob, Project, SshConfig, TargetStatus } from "../types";

/** Save state of one open editor tab: Compile persists edits before building,
 *  and the page-unload guard flushes them with keepalive requests. */
export interface EditorSaveHandle {
  /** True while the tab has unsaved edits. */
  readonly dirty: boolean;
  /** Persist the tab's current content (no-op when clean); true on success. */
  run: () => Promise<boolean>;
  /** Best-effort persist for page teardown (keepalive, fire-and-forget). */
  flush: () => void;
}

/** One-way sync request between editor and PDF (SyncTeX, M3). */
export interface SyncRequest {
  /** Project-relative file path, e.g. "main.tex". */
  file: string;
  /** 1-based source line. */
  line: number;
  /** Bumped on every request so identical targets re-trigger. */
  nonce: number;
}

/** One-way request: scroll the PDF pane to a page (Structure outline click). */
export interface PdfPageRequest {
  /** 1-based page number of the destination. */
  page: number;
  /** Destination top in PDF points from the page bottom (null = top of page). */
  topPt: number | null;
  /** Bumped on every request so identical targets re-trigger. */
  nonce: number;
}

/** Live content of one open editor tab, registered by the Editor pane so other
 *  modules (Structure) can parse the document as it is edited. */
export interface EditorContentHandle {
  /** Current document text, read live from the editor state. */
  readonly text: string;
  /** Subscribe to document changes; returns an unsubscribe function. */
  subscribe: (cb: () => void) => () => void;
}

export interface AppCtx {
  projectOpen: boolean;
  /** Absolute root of the open project (null when none) — per-project reload key. */
  projectRoot: string | null;
  /** File path of the active center editor tab (for explorer highlighting). */
  activeFile: string | null;
  /** True when the focused pane's active tab is an editor tab — a single click in the Explorer opens files. */
  editorFocused: boolean;
  /** True when the focused pane's active tab is a PDF tab — Structure follows the displayed PDF. */
  pdfFocused: boolean;
  /** True when any editor tab is open — with none open, a single click in the Explorer also opens files. */
  anyEditorOpen: boolean;
  /** The open project (null when none) — pane headers need its config. */
  project: Project | null;
  /** Project-relative path of a static PDF shown in the PDF pane (null = compiled main.pdf). */
  pdfFile: string | null;
  /** Open a project PDF file read-only in the PDF pane. */
  onOpenPdf: (path: string) => void;
  /** Show the compiled main.pdf output in the PDF pane again. */
  onShowMainPdf: () => void;
  /** Start a manual compile of the project's main file. */
  onCompile: () => void;
  /** Start a manual compile of a specific .tex file (the editor's picker). */
  onCompileFile: (file: string) => void;
  /** Persist the project's main .tex file (chosen from the file list, Overleaf-style). */
  onSaveMainFile: (file: string) => void;
  autoCompile: boolean;
  onAutoCompile: (on: boolean) => void;
  targetStatuses: TargetStatus[] | null;
  onTarget: (target: string) => void;
  /** Persist the SSH compile-target config for the current project (M4). */
  onSaveSsh: (cfg: SshConfig) => void;
  /** Open the Install TeX pane. */
  onShowInstall: () => void;
  /** Open/focus the Run Log pane (compile failures). */
  onShowLog: () => void;
  pdfVersion: number;
  job: ActiveJob | null;
  onOpenFile: (path: string) => void;
  onCancelJob: () => void;
  onStartInstall: (target: string, distro?: string) => void;
  /** Explorer reported these paths no longer exist (delete). */
  onPathsGone: (prefixes: string[]) => void;
  /** Explorer renamed a path; editor tabs are remapped by the app. */
  onFileRenamed: (oldPath: string, newPath: string) => void;
  /** Editor → PDF forward search request (click in the editor). */
  pdfSync: SyncRequest | null;
  /** PDF → editor inverse search request (click in the PDF). */
  editorGoto: SyncRequest | null;
  /** Jump the PDF to a source line (forward search). */
  syncToPdf: (file: string, line: number) => void;
  /** Open/focus a file at a source line (inverse search from the PDF). */
  syncToEditor: (file: string, line: number) => void;
  /** A file was saved in the editor (auto-compile on save, M3). */
  onFileSaved: (path: string) => void;
  /** Editor tabs register their save here so Compile can persist open edits
   *  before building (a compile reads from disk) and the unload guard can flush
   *  them. Returns an unregister fn. */
  registerEditorSave: (filePath: string, save: EditorSaveHandle) => () => void;
  /** Editor tabs register their live content here (Structure outline). Returns an unregister fn. */
  registerEditorContent: (filePath: string, content: EditorContentHandle) => () => void;
  /** Live content of an open editor tab (null while the tab is loading or closed). */
  editorContent: (filePath: string) => string | null;
  /** Subscribe to document changes of an open editor tab (no-op unsubscribe when not open). */
  subscribeEditorContent: (filePath: string, cb: () => void) => () => void;
  /** Scroll-the-PDF request from the Structure outline (issue 38). */
  pdfGoto: PdfPageRequest | null;
  /** Scroll the PDF pane to a page (Structure outline click in PDF mode). */
  gotoPdfPage: (page: number, topPt?: number | null) => void;
  /** All .tex files in the project (compile picker + main-file setting); null while loading. */
  texFiles: string[] | null;
  /** Re-fetch the .tex list (after create/rename/delete in the Explorer). */
  refreshTexFiles: () => void;
  /** Artifact names of the current compiled output (derived from the main file before any compile). */
  pdfArtifact: { pdf: string; synctex: string } | null;
  /** Bumped when project files change externally - the Explorer reloads its tree. */
  treeTick: number;
  /** Ask the Explorer to reload its tree (after Save version / Save As in the PDF pane). */
  bumpTree: () => void;
}
