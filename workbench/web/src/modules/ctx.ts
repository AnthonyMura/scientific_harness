// Shared application context handed to every module render.
import type { ActiveJob } from "../types";

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
