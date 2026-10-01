// Issue 49: the "Install TeX" button was removed from the top bar. The web
// suite runs in a node environment (no DOM / jsdom yet), so this is a
// source-level guard on the changed surface, using Vite's ?raw imports:
// ProjectBar must not declare or render the install props again, and App
// must not pass them.
import { describe, expect, it } from "vitest";

import appSrc from "../App.tsx?raw";
import projectBarSrc from "./ProjectBar.tsx?raw";

describe("top bar (issue 49)", () => {
  it("no longer renders the Install TeX button", () => {
    expect(projectBarSrc).not.toContain("Install TeX");
  });

  it("no longer declares the showInstall / onToggleInstall props", () => {
    expect(projectBarSrc).not.toContain("showInstall");
    expect(projectBarSrc).not.toContain("onToggleInstall");
  });

  it("App no longer wires the removed props into ProjectBar", () => {
    expect(appSrc).not.toMatch(/showInstall\s*=\s*false/);
    expect(appSrc).not.toMatch(/onToggleInstall\s*=/);
  });
});
