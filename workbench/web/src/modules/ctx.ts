// Shared application context handed to every module render.
import type { ActiveJob, Project, SshConfig, TargetStatus } from "../types";

/** One-way sync request between editor and PDF (SyncTeX, M3). */
export interface SyncRequest {
  /** Project-relative file path, e.g. "main.tex". */
  file: string;
  /** 1-based source line. */
  line: number;
  /** Bumped on every request so identical targets re-trigger. */
  nonce: number;
}

export interface AppCtx {
  projectOpen: boolean;
  /** Absolute root of the open project (null when none) — per-project reload key. */
  projectRoot: string | null;
  /** File path of the active center editor tab (for explorer highlighting). */
  activeFile: string | null;
  /** True when the focused pane's active tab is an editor tab — a single click in the Explorer opens files. */
  editorFocused: boolean;
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
  autoCompile: boolean;
  onAutoCompile: (on: boolean) => void;
  targetStatuses: TargetStatus[] | null;
  onTarget: (target: string) => void;
  /** Persist the SSH compile-target config for the current project (M4). */
  onSaveSsh: (cfg: SshConfig) => void;
  /** Open the Install TeX pane. */
  onShowInstall: () => void;
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
}
