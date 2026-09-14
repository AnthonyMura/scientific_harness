// Pure helpers for the compile-target selector (M3): map the backend's
// /api/install/status probe results to top-bar UI state. No React, no fetch —
// unit-testable from the page via Vite's ESM import.
import type { TargetStatus } from "../types";

/** Compile target names the backend accepts (targets.get_target). */
export const COMPILE_TARGETS = ["auto", "local", "wsl", "ssh"] as const;
export type CompileTarget = (typeof COMPILE_TARGETS)[number];

function firstLine(s: string): string {
  return s.split("\n").find((l) => l.trim())?.trim() || "";
}

/** What the "local" compile target would actually use (TinyTeX first). */
export function localTexSummary(targets: TargetStatus[] | null): { ok: boolean; text: string } {
  const tt = targets?.find((t) => t.name === "in-app TinyTeX");
  const loc = targets?.find((t) => t.name === "local");
  if (tt?.tex_found) return { ok: true, text: `in-app TinyTeX — ${firstLine(tt.version)}` };
  if (loc?.tex_found) return { ok: true, text: `system TeX — ${firstLine(loc.version)}` };
  const why = tt ? "not installed yet" : loc?.detail || "no TeX on this host";
  return { ok: false, text: `local: ${why}` };
}

/** The backend only offers the wsl target on Windows hosts. */
export function hasWslTarget(targets: TargetStatus[] | null): boolean {
  return !!targets?.some((t) => t.name === "wsl");
}

function hintForLocal(targets: TargetStatus[] | null): string {
  const tt = targets?.find((t) => t.name === "in-app TinyTeX");
  if (tt?.can_install && tt.install_hint) return tt.install_hint;
  return targets?.find((t) => t.name === "local")?.install_hint || "";
}

/** Tooltip text for a compile-target option (status + install hint). */
export function targetTooltip(target: string, targets: TargetStatus[] | null): string {
  if (target === "local") {
    const s = localTexSummary(targets);
    return s.ok ? `local — ${s.text}` : `${s.text}. ${hintForLocal(targets)}`;
  }
  if (target === "wsl") {
    const w = targets?.find((t) => t.name === "wsl");
    if (!w) return "wsl — requires a Windows host";
    const base = `wsl — ${w.detail || (w.tex_found ? "TeX found" : "no TeX in the WSL distro")}`;
    return !w.tex_found && w.can_install && w.install_hint ? `${base}. ${w.install_hint}` : base;
  }
  if (target === "ssh") {
    const sh = targets?.find((t) => t.name === "ssh");
    if (!sh) return "ssh — remote compile over key-based ssh (configure with SSH… in the top bar)";
    if (!sh.available) return `ssh — ${sh.detail}`;
    if (sh.tex_found) return `ssh — ${sh.detail} (${firstLine(sh.version)})`;
    return `ssh — ${sh.detail}. ${sh.install_hint}`;
  }
  // auto
  const s = localTexSummary(targets);
  const wslOk = !!targets?.find((t) => t.name === "wsl")?.tex_found;
  if (s.ok) return `auto — resolves to local (${s.text})`;
  if (wslOk) return "auto — resolves to wsl (TeX found in the WSL distro)";
  return "auto — no TeX installation found. Install the in-app TinyTeX (recommended, no admin rights) or a system TeX.";
}

/** Whether the selected target lacks a usable TeX (drives the warning chip). */
export function needsInstall(target: string, targets: TargetStatus[] | null): boolean {
  if (!targets) return false; // still probing — don't nag prematurely
  const s = localTexSummary(targets);
  const wslOk = !!targets.find((t) => t.name === "wsl")?.tex_found;
  switch (target) {
    case "local":
      return !s.ok;
    case "wsl":
      return !wslOk;
    case "ssh": {
      const sh = targets.find((t) => t.name === "ssh");
      return !!sh && !sh.tex_found;
    }
    default:
      return !s.ok && !wslOk; // auto
  }
}

/** One-line hint shown on the warning chip. */
export function installHint(target: string, targets: TargetStatus[] | null): string {
  if (target === "wsl") {
    const w = targets?.find((t) => t.name === "wsl");
    return w?.install_hint || "Install TeX in the WSL distro via the Install panel.";
  }
  if (target === "ssh") {
    return targets?.find((t) => t.name === "ssh")?.install_hint ||
      "Set up TeX Live + latexmk on the remote machine, then re-probe.";
  }
  return hintForLocal(targets) || "Install TeX via the Install panel (in-app TinyTeX is recommended).";
}
