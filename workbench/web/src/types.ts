export interface Project {
  id: string;
  name: string;
  root: string;
  main_file: string;
  target: string;
  /** Auto-compile after saving a .tex file (per project, M3). */
  auto_compile: boolean;
  /** SSH compile target config (M4, per project); null/absent = not set. */
  ssh?: SshConfig | null;
  /** Template id the project was created from / filled with (issue 43). */
  template?: string | null;
  /** Git state, present on new-project and fill responses only. */
  git?: { repo: boolean; initialized: boolean } | null;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  kind: string;
  main_file: string;
  tex_packages: string[];
  /** Every file the template ships (manifest.json excluded), as posix paths. */
  files: string[];
  default?: boolean;
}

export interface FillResult {
  template: string;
  /** Template files missing from the project — what Apply would create. */
  create: string[];
  /** Template files already present — left untouched, always. */
  skip: string[];
  git: { repo: boolean; initialized: boolean };
  /** Set when a LaTeX template is being filled into a markdown-only project. */
  warning?: string;
  applied?: boolean;
}

export interface SshConfig {
  host?: string;
  user?: string;
  port?: number;
  key?: string;
  remote_dir?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: number;
}

export interface TreeResponse {
  dir: string;
  entries: FileEntry[];
}

/** One directory level of an arbitrary local path — Open-project autocomplete (issue 47). */
export interface FsEntry {
  name: string;
  is_dir: boolean;
}

export interface FsListResponse {
  path: string;
  entries: FsEntry[];
  truncated: boolean;
}

export interface JobError {
  line: number | null;
  message: string;
  raw: string;
}

export interface ActiveJob {
  id: string;
  kind: "compile" | "install";
  label: string;
  status: "running" | "done" | "error" | "cancelled";
  exit_code: number | null;
  logLines: string[];
  errors: JobError[];
  artifacts: Record<string, string>;
}

export interface TargetStatus {
  name: string;
  available: boolean;
  detail: string;
  tex_found: boolean;
  version: string;
  missing: { file: string; package: string }[];
  can_install: boolean;
  install_hint: string;
  install_command: string;
  distros: string[];
  recommended?: boolean;
}

export interface ConfigResponse {
  global: { wsl_distro: string | null };
  project: Record<string, unknown>;
}