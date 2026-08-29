import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { numberedSidebarShortcuts, sidebarShortcutKey } from "./sidebarShortcuts";

function shellTab(id: string, projectId: string): TerminalTabState {
  return {
    id,
    number: 1,
    title: id,
    detail: "",
    projectId,
    cwd: "/tmp",
    launch: { kind: "shell" },
    status: "running",
  };
}

describe("numberedSidebarShortcuts", () => {
  it("numbers agents before terminals in their global project-tree order", () => {
    const projects: ProjectTreeProject[] = [
      {
        id: "one",
        name: "One",
        directory: "/one",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
        agents: [{ id: "pi", name: "Pi", command: "pi" }],
        commands: [{ id: "build", name: "Build", command: "npm run build" }],
      },
      {
        id: "two",
        name: "Two",
        directory: "/two",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
        commands: [{ id: "test", name: "Test", command: "npm test" }],
      },
    ];
    const parentAgent = {
      ...shellTab("one-agent", "one"),
      launch: {
        kind: "command" as const,
        commandId: "pi",
        commandLine: "pi",
        source: "agent" as const,
      },
    };
    const subagent = {
      ...shellTab("one-subagent", "one"),
      launch: {
        kind: "subagent" as const,
        subagentId: "subagent-1",
        parentTerminalId: parentAgent.id,
        name: "Research",
        commandLine: "pi research",
        processKind: "pi",
      },
    };
    const shortcuts = numberedSidebarShortcuts(projects, [
      shellTab("one-a", "one"),
      shellTab("two-a", "two"),
      shellTab("one-b", "one"),
      parentAgent,
      subagent,
    ]);

    expect(
      shortcuts.map(({ number, selection }) => [number, sidebarShortcutKey(selection)]),
    ).toEqual([
      [1, "agent:one:pi"],
      [2, "subagent:one-subagent"],
      [3, "terminal:one-a"],
      [4, "terminal:one-b"],
      [5, "command:one:build"],
      [6, "terminal:two-a"],
      [7, "command:two:test"],
    ]);
  });

  it("uses the filtered rendered hierarchy, including ancestors of matching children", () => {
    const projects: ProjectTreeProject[] = [
      {
        id: "one",
        name: "One",
        directory: "/one",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
      },
    ];
    const parent = shellTab("parent", "one");
    const matchingChild = {
      ...shellTab("child", "one"),
      title: "Deploy API",
      parentTerminalId: parent.id,
    };
    const hidden = shellTab("hidden", "one");

    expect(
      numberedSidebarShortcuts(projects, [parent, matchingChild, hidden], "deploy").map(
        ({ selection }) => sidebarShortcutKey(selection),
      ),
    ).toEqual(["terminal:parent", "terminal:child"]);
  });

  it("uses the same normalized order as rendered terminal nodes for invalid hierarchy links", () => {
    const projects: ProjectTreeProject[] = [
      {
        id: "one",
        name: "One",
        directory: "/one",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
      },
    ];
    const root = shellTab("root", "one");
    const child = { ...shellTab("child", "one"), parentTerminalId: root.id };
    const deep = { ...shellTab("deep", "one"), parentTerminalId: child.id };
    const stale = { ...shellTab("stale", "one"), parentTerminalId: "gone" };
    const cycleA = { ...shellTab("cycle-a", "one"), parentTerminalId: "cycle-b" };
    const cycleB = { ...shellTab("cycle-b", "one"), parentTerminalId: "cycle-a" };

    expect(
      numberedSidebarShortcuts(projects, [root, child, deep, stale, cycleA, cycleB]).map(
        ({ selection }) => sidebarShortcutKey(selection),
      ),
    ).toEqual([
      "terminal:root",
      "terminal:child",
      "terminal:deep",
      "terminal:stale",
      "terminal:cycle-a",
      "terminal:cycle-b",
    ]);
  });
});
