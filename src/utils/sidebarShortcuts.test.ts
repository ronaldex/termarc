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
  it("numbers terminals and commands in their global project-tree order", () => {
    const projects: ProjectTreeProject[] = [
      {
        id: "one",
        name: "One",
        directory: "/one",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
        commands: [{ id: "build", name: "Build", command: "npm run build", mode: "single-shot" }],
      },
      {
        id: "two",
        name: "Two",
        directory: "/two",
        projectOpen: true,
        terminalOpen: true,
        commandsOpen: true,
        commands: [{ id: "test", name: "Test", command: "npm test", mode: "single-shot" }],
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
      [1, "terminal:one-a"],
      [2, "terminal:one-b"],
      [3, "command:one:build"],
      [4, "terminal:two-a"],
      [5, "command:two:test"],
    ]);
  });
});
