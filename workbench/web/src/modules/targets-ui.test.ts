// Unit tests for the compile-target selector helpers (issue 58). Node env, no DOM.
import { describe, expect, it } from "vitest";
import type { TargetStatus } from "../types";
import {
  COMPILE_TARGETS,
  hasWslTarget,
  installHint,
  localTexSummary,
  needsInstall,
  targetTooltip,
} from "./targets-ui";

function mk(over: Partial<TargetStatus> & { name: string }): TargetStatus {
  return {
    available: true,
    detail: "",
    tex_found: false,
    version: "",
    missing: [],
    can_install: false,
    install_hint: "",
    install_command: "",
    distros: [],
    ...over,
  };
}

const TINYTEX_OK = mk({ name: "tinytex", tex_found: true, version: "TeX Live (2026.1)", detail: "in-app TinyTeX ready" });
const TINYTEX_MISSING = mk({
  name: "tinytex",
  can_install: true,
  install_hint: "Installs into a hidden folder inside the app — no admin rights.",
  detail: "not installed yet",
});
const SYSTEM_OK = mk({ name: "system", tex_found: true, version: "Latexmk, John Collins' version 4.86", detail: "found on PATH" });
const SYSTEM_MISSING = mk({
  name: "system",
  can_install: true,
  install_hint: "Installs the targeted TeX Live set via apt.",
  detail: "no system TeX installation found on this host (PATH)",
});
const WSL_OK = mk({ name: "wsl", tex_found: true, version: "Latexmk 4.86", detail: "TeX found in WSL distro Ubuntu" });
const SSH_OFF = mk({ name: "ssh", available: false, detail: "not configured — pick Target → SSH… in the top bar" });

describe("COMPILE_TARGETS (issue 58)", () => {
  it("offers auto / tinytex / system / wsl / ssh — no legacy 'local'", () => {
    expect([...COMPILE_TARGETS]).toEqual(["auto", "tinytex", "system", "wsl", "ssh"]);
  });
});

describe("localTexSummary (composite alias)", () => {
  it("prefers the in-app TinyTeX when both are installed", () => {
    const s = localTexSummary([TINYTEX_OK, SYSTEM_OK]);
    expect(s.ok).toBe(true);
    expect(s.text).toContain("in-app TinyTeX");
  });
  it("falls back to system TeX when TinyTeX is not installed", () => {
    const s = localTexSummary([TINYTEX_MISSING, SYSTEM_OK]);
    expect(s.ok).toBe(true);
    expect(s.text).toContain("system TeX");
  });
  it("is not ok when neither is installed", () => {
    expect(localTexSummary([TINYTEX_MISSING, SYSTEM_MISSING]).ok).toBe(false);
  });
});

describe("hasWslTarget", () => {
  it("only true when the probe offers wsl (Windows hosts)", () => {
    expect(hasWslTarget([WSL_OK])).toBe(true);
    expect(hasWslTarget([TINYTEX_OK, SYSTEM_OK])).toBe(false);
    expect(hasWslTarget(null)).toBe(false);
  });
});

describe("needsInstall", () => {
  it("flags tinytex / system when their TeX is missing", () => {
    expect(needsInstall("tinytex", [TINYTEX_MISSING, SYSTEM_OK])).toBe(true);
    expect(needsInstall("tinytex", [TINYTEX_OK, SYSTEM_MISSING])).toBe(false);
    expect(needsInstall("system", [TINYTEX_OK, SYSTEM_MISSING])).toBe(true);
    expect(needsInstall("system", [TINYTEX_MISSING, SYSTEM_OK])).toBe(false);
  });
  it("flags the legacy local alias by its composite state", () => {
    expect(needsInstall("local", [TINYTEX_MISSING, SYSTEM_MISSING])).toBe(true);
    expect(needsInstall("local", [TINYTEX_OK, SYSTEM_MISSING])).toBe(false);
  });
  it("flags wsl only when TeX is absent, ssh only when the entry exists without TeX", () => {
    expect(needsInstall("wsl", [WSL_OK])).toBe(false);
    expect(needsInstall("wsl", [TINYTEX_OK])).toBe(true);
    expect(needsInstall("ssh", [SSH_OFF])).toBe(true);
    expect(needsInstall("ssh", [TINYTEX_OK])).toBe(false);
  });
  it("auto is ok when any composite leg or wsl has TeX; null targets never nag", () => {
    expect(needsInstall("auto", [TINYTEX_MISSING, SYSTEM_MISSING])).toBe(true);
    expect(needsInstall("auto", [TINYTEX_OK, SYSTEM_MISSING])).toBe(false);
    expect(needsInstall("auto", [TINYTEX_MISSING, SYSTEM_MISSING, WSL_OK])).toBe(false);
    expect(needsInstall("tinytex", null)).toBe(false);
  });
});

describe("targetTooltip", () => {
  it("tinytex: version when found, install hint when missing", () => {
    expect(targetTooltip("tinytex", [TINYTEX_OK])).toContain("TeX Live (2026.1)");
    const tip = targetTooltip("tinytex", [TINYTEX_MISSING]);
    expect(tip).toContain("not installed yet");
    expect(tip).toContain("no admin rights");
  });
  it("system: version when found, PATH detail when missing", () => {
    expect(targetTooltip("system", [SYSTEM_OK])).toContain("4.86");
    expect(targetTooltip("system", [SYSTEM_MISSING])).toContain("(PATH)");
  });
  it("local (legacy): composite text prefers TinyTeX", () => {
    expect(targetTooltip("local", [TINYTEX_OK, SYSTEM_OK])).toContain("in-app TinyTeX");
    expect(targetTooltip("local", [TINYTEX_MISSING, SYSTEM_OK])).toContain("system TeX");
  });
  it("auto: resolves to the first working leg, or a full install nudge", () => {
    expect(targetTooltip("auto", [TINYTEX_OK])).toContain("resolves to");
    expect(targetTooltip("auto", [TINYTEX_MISSING, SYSTEM_MISSING])).toContain("no TeX installation found");
  });
});

describe("installHint", () => {
  it("uses the probe's own hint when present, otherwise a generic nudge", () => {
    expect(installHint("tinytex", [TINYTEX_MISSING])).toBe(TINYTEX_MISSING.install_hint);
    expect(installHint("system", [SYSTEM_MISSING])).toBe(SYSTEM_MISSING.install_hint);
    expect(installHint("tinytex", [mk({ name: "tinytex" })])).toContain("Install panel");
  });
});
