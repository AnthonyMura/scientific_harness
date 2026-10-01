// Pure helpers for the compile-target selector (M3, issue 58): map the
// backend's /api/install/status probe results to settings-menu UI state.
// Probe entry names equal the compile target names ("tinytex", "system",
// "wsl", "ssh"); "local" survives as a backward-compat composite alias
// (TinyTeX first, then system TeX). No React, no fetch — unit-testable in node.
import type { TargetStatus } from "../types";

/** Compile target names the backend accepts (targets.get_target). */
export const COMPILE_TARGETS = ["auto", "tinytex", "system", "wsl", "ssh"] as const;
export type CompileTarget = (typeof COMPILE_TARGETS)[number];

function firstLine(s: string): string {
  return s.split("\n").find((l) => l.trim())?.trim() || "";
}

/** detail plus the probe's version line, deduped when they are identical. */
function withVersion(detail: string, version: string): string {
  const v = firstLine(version);
  return v && v !== detail ? `${detail} (${v})` : detail;
}

function entry(targets: TargetStatus[] | null, name: string): TargetStatus | undefined {
  return targets?.find((t) => t.name === name);
}

/** What the composite "local" alias would actually use (TinyTeX first). */
export function localTexSummary(targets: TargetStatus[] | null): { ok: boolean; text: string } {
  const tt = entry(targets, "tinytex");
  const sys = entry(targets, "system");
  if (tt?.tex_found) return { ok: true, text: `in-app TinyTeX — ${firstLine(tt.version)}` };
  if (sys?.tex_found) return { ok: true, text: `system TeX — ${firstLine(sys.version)}` };
  const why = tt ? "TinyTeX not installed yet" : sys?.detail || "no TeX on this host";
  return { ok: false, text: `local: ${why}` };
}

/** The backend only offers the wsl target on Windows hosts. */
export function hasWslTarget(targets: TargetStatus[] | null): boolean {
  return !!targets?.some((t) => t.name === "wsl");
}

function hintFor(name: string, targets: TargetStatus[] | null): string {
  const t = entry(targets, name);
  return t?.can_install && t.install_hint ? t.install_hint : "";
}

/** Tooltip text for a compile-target option (status + install hint). */
export function targetTooltip(target: string, targets: TargetStatus[] | null): string {
  if (target === "tinytex") {
    const tt = entry(targets, "tinytex");
    if (!tt) return "tinytex — in-app TinyTeX: a hidden TeX Live inside the app folder (no admin rights)";
    if (tt.tex_found) return `tinytex — ${withVersion(tt.detail, tt.version)}`;
    const hint = hintFor("tinytex", targets);
    return `tinytex — ${tt.detail}${hint ? ". " + hint : ""}`;
  }
  if (target === "system") {
    const sys = entry(targets, "system");
    if (!sys) return "system — system-wide TeX on PATH (MiKTeX / TeX Live / MacTeX)";
    if (sys.tex_found) return `system — ${withVersion(sys.detail, sys.version)}`;
    const hint = hintFor("system", targets);
    return `system — ${sys.detail}${hint ? ". " + hint : ""}`;
  }
  if (target === "local") {
    const s = localTexSummary(targets);
    const hint = hintFor("tinytex", targets) || hintFor("system", targets);
    return s.ok ? `local — ${s.text}` : `${s.text}${hint ? ". " + hint : ""}`;
  }
  if (target === "wsl") {
    const w = entry(targets, "wsl");
    if (!w) return "wsl — requires a Windows host";
    const base = `wsl — ${w.detail || (w.tex_found ? "TeX found" : "no TeX in the WSL distro")}`;
    return !w.tex_found && w.can_install && w.install_hint ? `${base}. ${w.install_hint}` : base;
  }
  if (target === "ssh") {
    const sh = entry(targets, "ssh");
    if (!sh) return "ssh — remote compile over key-based ssh (configure with SSH… in the top bar)";
    if (!sh.available) return `ssh — ${sh.detail}`;
    if (sh.tex_found) return `ssh — ${sh.detail} (${firstLine(sh.version)})`;
    const hint = sh.install_hint ? `. ${sh.install_hint}` : "";
    return `ssh — ${sh.detail}${hint}`;
  }
  // auto: tinytex → system (composite local) → wsl on Windows
  const s = localTexSummary(targets);
  if (s.ok) return `auto — resolves to ${s.text}`;
  if (entry(targets, "wsl")?.tex_found) return "auto — resolves to wsl (TeX found in the WSL distro)";
  return "auto — no TeX installation found. Install the in-app TinyTeX (recommended, no admin rights) or a system TeX.";
}

/** Whether the selected target lacks a usable TeX (drives the warning chip). */
export function needsInstall(target: string, targets: TargetStatus[] | null): boolean {
  if (!targets) return false; // still probing — don't nag prematurely
  switch (target) {
    case "tinytex":
      return !entry(targets, "tinytex")?.tex_found;
    case "system":
      return !entry(targets, "system")?.tex_found;
    case "local":
      return !localTexSummary(targets).ok;
    case "wsl":
      return !entry(targets, "wsl")?.tex_found;
    case "ssh": {
      const sh = entry(targets, "ssh");
      return !!sh && !sh.tex_found;
    }
    default: // auto
      return !localTexSummary(targets).ok && !entry(targets, "wsl")?.tex_found;
  }
}

/** One-line hint shown on the warning chip. */
export function installHint(target: string, targets: TargetStatus[] | null): string {
  if (target === "wsl") {
    return entry(targets, "wsl")?.install_hint || "Install TeX in the WSL distro via the Install panel.";
  }
  if (target === "ssh") {
    return entry(targets, "ssh")?.install_hint ||
      "Set up TeX Live + latexmk on the remote machine, then re-probe.";
  }
  if (target === "tinytex") {
    return hintFor("tinytex", targets) || "Install the in-app TinyTeX via the Install panel.";
  }
  if (target === "system" || target === "local") {
    return hintFor("system", targets) || hintFor("tinytex", targets) ||
      "Install TeX via the Install panel (in-app TinyTeX is recommended).";
  }
  // auto
  return hintFor("tinytex", targets) || hintFor("system", targets) ||
    "Install TeX via the Install panel (in-app TinyTeX is recommended).";
}
