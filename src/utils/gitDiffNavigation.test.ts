import { describe, expect, it } from "vitest";
import { gitDiffNavigationAction } from "./gitDiffNavigation";

const keys = ["one", "two", "three"];

describe("gitDiffNavigationAction", () => {
  it("moves between files and wraps", () => {
    expect(gitDiffNavigationAction("ArrowDown", keys, "one", new Set())).toEqual({
      type: "focus",
      key: "two",
    });
    expect(gitDiffNavigationAction("ArrowUp", keys, "one", new Set())).toEqual({
      type: "focus",
      key: "three",
    });
  });

  it("enters the list at the nearest boundary", () => {
    expect(gitDiffNavigationAction("ArrowDown", keys, undefined, new Set())).toEqual({
      type: "focus",
      key: "one",
    });
    expect(gitDiffNavigationAction("ArrowUp", keys, undefined, new Set())).toEqual({
      type: "focus",
      key: "three",
    });
  });

  it("expands right, collapses left, and toggles with enter", () => {
    expect(gitDiffNavigationAction("ArrowRight", keys, "one", new Set())).toEqual({
      type: "toggle",
      key: "one",
    });
    expect(gitDiffNavigationAction("ArrowLeft", keys, "one", new Set(["one"]))).toEqual({
      type: "toggle",
      key: "one",
    });
    expect(gitDiffNavigationAction("Enter", keys, "one", new Set())).toEqual({
      type: "toggle",
      key: "one",
    });
  });

  it("enters an expanded file with right and ignores left on a collapsed file", () => {
    expect(gitDiffNavigationAction("ArrowRight", keys, "one", new Set(["one"]))).toEqual({
      type: "enter",
      key: "one",
    });
    expect(gitDiffNavigationAction("ArrowLeft", keys, "one", new Set())).toBeUndefined();
  });

  it("uses the first file when the active key is stale", () => {
    expect(gitDiffNavigationAction("Enter", keys, "missing", new Set())).toEqual({
      type: "toggle",
      key: "one",
    });
  });

  it("ignores unsupported keys and empty file lists", () => {
    expect(gitDiffNavigationAction("PageDown", keys, "one", new Set())).toBeUndefined();
    expect(gitDiffNavigationAction("ArrowDown", [], undefined, new Set())).toBeUndefined();
  });
});
