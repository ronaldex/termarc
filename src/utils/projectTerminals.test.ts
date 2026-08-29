import { describe, expect, it } from "vitest";
import type { TerminalTabState } from "../types/terminal";
import {
  normalizeProjectTerminals,
  projectTerminalsEqual,
  projectTerminalsFromTabs,
} from "./projectTerminals";

function terminal(
  projectId: string,
  customTitle?: string,
  kind: "shell" | "command" = "shell",
): TerminalTabState {
  return {
    id: `${projectId}-${customTitle ?? kind}`,
    projectId,
    customTitle,
    launch:
      kind === "shell"
        ? { kind: "shell" }
        : {
            kind: "command",
            commandId: "command-1",
            commandLine: "npm run dev",
          },
  } as TerminalTabState;
}

describe("project terminal persistence", () => {
  it("keeps shell count and custom names in tab order", () => {
    const tabs = [
      terminal("project-a", " Editor "),
      terminal("project-b", "Other"),
      terminal("project-a"),
      terminal("project-a", "Ignored command", "command"),
    ];

    expect(projectTerminalsFromTabs(tabs, "project-a")).toEqual([
      { id: "project-a- Editor ", customTitle: "Editor" },
      { id: "project-a-shell" },
    ]);
  });

  it("persists a shell parent relationship", () => {
    const parent = terminal("project-a", "Parent");
    const child = { ...terminal("project-a", "Child"), parentTerminalId: parent.id };
    expect(projectTerminalsFromTabs([parent, child], "project-a")).toEqual([
      { id: "project-a-Parent", customTitle: "Parent" },
      { id: "project-a-Child", customTitle: "Child", parentTerminalId: "project-a-Parent" },
    ]);
  });

  it("preserves missing terminal lists for legacy migration and explicit empty lists", () => {
    expect(normalizeProjectTerminals(undefined)).toBeUndefined();
    expect(normalizeProjectTerminals([])).toEqual([]);
  });

  it("orders restored direct children immediately after their root", () => {
    expect(
      normalizeProjectTerminals([
        { id: "child", parentTerminalId: "root" },
        { id: "other" },
        { id: "root" },
      ]),
    ).toEqual([{ id: "other" }, { id: "root" }, { id: "child", parentTerminalId: "root" }]);
  });

  it("promotes stale, cyclic, and too-deep restored terminals to roots", () => {
    expect(
      normalizeProjectTerminals([
        { id: "root" },
        { id: "child", parentTerminalId: "root" },
        { id: "grandchild", parentTerminalId: "child" },
        { id: "orphan", parentTerminalId: "missing" },
        { id: "cycle-a", parentTerminalId: "cycle-b" },
        { id: "cycle-b", parentTerminalId: "cycle-a" },
      ]),
    ).toEqual([
      { id: "root" },
      { id: "child", parentTerminalId: "root" },
      { id: "grandchild" },
      { id: "orphan" },
      { id: "cycle-a" },
      { id: "cycle-b" },
    ]);
  });

  it("normalizes blank custom names", () => {
    expect(
      normalizeProjectTerminals([
        { id: "one", customTitle: "   " },
        { id: "two", customTitle: " Logs " },
      ]),
    ).toEqual([{ id: "one" }, { id: "two", customTitle: "Logs" }]);
  });

  it("distinguishes missing state from an explicit matching list", () => {
    expect(projectTerminalsEqual(undefined, [])).toBe(false);
    expect(projectTerminalsEqual([], [])).toBe(true);
    expect(
      projectTerminalsEqual([{ id: "a", customTitle: "One" }], [{ id: "a", customTitle: "Two" }]),
    ).toBe(false);
  });
});
