// Shared application context handed to every module render.
import type { ActiveJob } from "../types";

export interface AppCtx {
  projectOpen: boolean;
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
}
