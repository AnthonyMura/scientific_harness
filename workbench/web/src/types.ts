export interface Project {
  id: string;
  name: string;
  root: string;
  main_file: string;
  target: string;
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