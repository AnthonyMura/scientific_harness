import { describe, expect, it } from "vitest";

import { entryDisplay, isDirPath } from "./GitPane";

describe("isDirPath (issue 56)", () => {
  it("flags trailing-slash porcelain entries as directories", () => {
    expect(isDirPath("versions/")).toBe(true);
    expect(isDirPath("docs/figures/")).toBe(true);
    expect(isDirPath("main.tex")).toBe(false);
    expect(isDirPath(".gitignore")).toBe(false);
  });
});

describe("entryDisplay (issue 56)", () => {
  it("splits plain file paths into name + parent dir", () => {
    expect(entryDisplay("docs/notes/main.tex")).toEqual({
      name: "main.tex",
      dir: "docs/notes",
      isDir: false,
    });
  });

  it("keeps root-level files dir-less", () => {
    expect(entryDisplay("main.tex")).toEqual({ name: "main.tex", dir: "", isDir: false });
  });

  it("makes the folder name primary for trailing-slash entries (was empty)", () => {
    // Before issue 56, baseName("versions/") === "" and parentDir returned
    // "versions" — the row showed no primary name.
    expect(entryDisplay("versions/")).toEqual({ name: "versions", dir: "", isDir: true });
  });

  it("handles nested untracked directories", () => {
    expect(entryDisplay("docs/figures/")).toEqual({ name: "figures", dir: "docs", isDir: true });
  });
});
