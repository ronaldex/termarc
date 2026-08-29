import { describe, expect, it } from "vitest";
import {
  availableRightSidebarModes,
  cycleRightSidebarMode,
  resolveRightSidebarMode,
} from "./rightSidebarModes";

describe("right sidebar modes", () => {
  it("orders, resolves, and cycles available modes", () => {
    const both = { subterminals: true, git: true };
    expect(availableRightSidebarModes(both)).toEqual(["subterminals", "git"]);
    expect(resolveRightSidebarMode(both)).toBe("subterminals");
    expect(resolveRightSidebarMode(both, "git")).toBe("git");
    expect(cycleRightSidebarMode(both, "subterminals")).toBe("git");
    expect(cycleRightSidebarMode(both, "git")).toBe("subterminals");
  });

  it("falls back and handles zero or one mode", () => {
    expect(resolveRightSidebarMode({ subterminals: false, git: true }, "subterminals")).toBe("git");
    expect(cycleRightSidebarMode({ subterminals: false, git: true }, "git")).toBe("git");
    expect(resolveRightSidebarMode({ subterminals: false, git: false })).toBeUndefined();
  });
});
