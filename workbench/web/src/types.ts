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

// ---------- Git (module 42) ----------------------------------------------

/** One changed file in the working tree: path + status badge letter. */
export interface GitFileEntry {
  path: string;
  /** M modified · A added/untracked · D deleted · R renamed · C copied · U unmerged. */
  badge: string;
}

/** GET /api/git/status — full working-tree state for the Changes view. */
export interface GitStatusResponse {
  git: boolean;
  repo: boolean;
  initialized: boolean;
  branch: string | null;
  detached: boolean;
  /** Short sha of HEAD (null before the first commit). */
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  changes: GitFileEntry[];
  remotes: { name: string; url: string }[];
}

/** One commit in the history list. */
export interface GitCommit {
  sha: string;
  short: string;
  author: string;
  ts: number;
  subject: string;
  body: string;
  refs: string[];
}

/** GET /api/git/log — bounded, newest first. */
export interface GitLogResponse {
  commits: GitCommit[];
  total: number;
}

/** Per-file numstat entry for one commit (commit-info `files`). */
export interface GitCommitFile {
  path: string;
  from: string | null;
  added: number;
  removed: number;
  binary: boolean;
}

/** GET /api/git/commit-info — commit metadata + per-file numstat. */
export interface GitCommitInfoResponse extends GitCommit {
  files: GitCommitFile[];
}

/** GET /api/git/diff and GET /api/git/worktree-diff. */
export interface GitDiffResponse {
  file: string;
  binary: boolean;
  diff: string;
}

/** GET /api/git/branches. */
export interface GitBranchesResponse {
  branches: { name: string; current: boolean }[];
  current: string | null;
}