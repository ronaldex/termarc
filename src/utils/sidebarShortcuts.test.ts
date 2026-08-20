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
    const shortcuts = numberedSidebarShortcuts(projects, [
      shellTab("one-a", "one"),
      shellTab("two-a", "two"),
      shellTab("one-b", "one"),
    ]);

    expect(
      shortcuts.map(({ number, selection }) => [number, sidebarShortcutKey(selection)]),
    ).toEqual([
      [1, "agent:one:pi"],
      [2, "terminal:one-a"],
      [3, "terminal:one-b"],
      [4, "command:one:build"],
      [5, "terminal:two-a"],
      [6, "command:two:test"],
    ]);
  });
});
