import type {
  ConfigResponse,
  JobError,
  Project,
  TargetStatus,
  TreeResponse,
} from "./types";

export interface ApiConfig {
  baseUrl: string;
  token: string;
  devMode: boolean;
}

let cfg: ApiConfig | null = null;

/** Resolve API credentials: Electron preload bridge, or browser-dev fallback. */
export async function initApi(): Promise<ApiConfig> {
  if (cfg) return cfg;
  if (window.workbench) {
    const c = await window.workbench.getConfig();
    cfg = { baseUrl: c.baseUrl, token: c.token, devMode: false };
  } else {
    cfg = { baseUrl: "http://127.0.0.1:8765", token: "devtoken", devMode: true };
  }
  return cfg;
}

export function apiConfig(): ApiConfig {
  if (!cfg) throw new Error("API not initialized");
  return cfg;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const c = apiConfig();
  const res = await fetch(c.baseUrl + path, {
    method,
    headers: {
      "X-Workbench-Token": c.token,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>("GET", "/api/health"),

  openProject: (path: string) => request<Project>("POST", "/api/projects/open", { path }),
  newProject: (name: string, location?: string) =>
    request<Project>("POST", "/api/projects/new", { name, location }),
  recentProjects: () => request<{ projects: Project[] }>("GET", "/api/projects/recent"),
  currentProject: () => request<{ project: Project | null }>("GET", "/api/project/current"),

  tree: (dir = "", hidden = false) =>
    request<TreeResponse>(
      "GET",
      `/api/files/tree?dir=${encodeURIComponent(dir)}${hidden ? "&hidden=1" : ""}`,
    ),
  readFile: (path: string) =>
    request<{ path: string; content: string }>(
      "GET",
      `/api/files/read?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (path: string, content: string) =>
    request<{ path: string; bytes: number }>("PUT", "/api/files/write", { path, content }),
  createPath: (path: string, kind: "file" | "dir") =>
    request<{ path: string }>("POST", "/api/files/create", { path, kind }),
  renamePath: (from: string, to: string) =>
    request<{ from: string; to: string }>("POST", "/api/files/rename", { from, to }),
  deletePath: (path: string) => request<{ ok: boolean }>("POST", "/api/files/delete", { path }),

  /** Raw file bytes for image previews; null when the backend refuses (413/415). */
  fetchFileBytes: async (path: string): Promise<Blob | null> => {
    const c = apiConfig();
    const res = await fetch(`${c.baseUrl}/api/files/raw?path=${encodeURIComponent(path)}`, {
      headers: { "X-Workbench-Token": c.token },
    });
    if (!res.ok) return null;
    return res.blob();
  },

  startCompile: (main_file?: string, target?: string) =>
    request<{ job_id: string }>("POST", "/api/compile/start", { main_file, target }),
  jobStatus: (jobId: string, since = 0) =>
    request<JobSnapshot>(
      "GET",
      `/api/compile/status/${encodeURIComponent(jobId)}?since=${since}`,
    ),
  cancelJob: (jobId: string) =>
    request<{ ok: boolean }>("POST", `/api/compile/cancel/${encodeURIComponent(jobId)}`),

  fetchPdf: async (file = "main.pdf"): Promise<Blob> => {
    const c = apiConfig();
    const res = await fetch(
      `${c.baseUrl}/api/artifacts/pdf?file=${encodeURIComponent(file)}`,
      { headers: { "X-Workbench-Token": c.token } },
    );
    if (!res.ok) throw new Error(`no PDF artifact yet (HTTP ${res.status})`);
    return res.blob();
  },

  /** Gunzipped SyncTeX map, or null when the artifact does not exist yet. */
  async fetchSynctex(file = "main.synctex.gz"): Promise<string | null> {
    const c = apiConfig();
    const res = await fetch(`${c.baseUrl}/api/artifacts/synctex?file=${encodeURIComponent(file)}`, {
      headers: { "X-Workbench-Token": c.token },
    });
    if (!res.ok) return null; // no synctex artifact yet — sync stays disabled
    return res.text();
  },

  getConfig: () => request<ConfigResponse>("GET", "/api/config"),
  setConfig: (body: Partial<ConfigResponse>) =>
    request<{ ok: boolean }>("PUT", "/api/config", body),

  installStatus: () => request<{ targets: TargetStatus[] }>("GET", "/api/install/status"),
  startInstall: (target: string, distro?: string) =>
    request<{ job_id: string }>("POST", "/api/install/run", { target, distro }),
};

/** Job snapshot as returned by /api/compile/status (shared with install jobs). */
export interface JobSnapshot {
  id: string;
  kind: "compile" | "install";
  label: string;
  status: "running" | "done" | "error" | "cancelled";
  exit_code: number | null;
  log: string[];
  errors: JobError[];
  artifacts: Record<string, string>;
  total_lines: number;
}