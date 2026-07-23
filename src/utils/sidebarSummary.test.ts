import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { projectInitials, projectRailSelections, projectRailSummaries } from "./sidebarSummary";

const project: ProjectTreeProject = {
  id: "project-1",
  name: "Term Deck",
  directory: ".",
  commands: [{ id: "dev", name: "Dev", command: "npm run dev", mode: "persistent" }],
  projectOpen: true,
  terminalOpen: true,
  commandsOpen: true,
};

function tab(overrides: Partial<TerminalTabState> = {}): TerminalTabState {
  return {
    id: "terminal-1",
    number: 1,
    title: "Terminal 1",
    detail: "Shell ready",
    projectId: project.id,
    cwd: ".",
    launch: { kind: "shell" },
    status: "running",
    processName: "pi",
    ...overrides,
  };
}

describe("projectInitials", () => {
  it("creates compact project initials", () => {
    expect(projectInitials("Term Deck")).toBe("TD");
    expect(projectInitials("single")).toBe("S");
    expect(projectInitials(" ")).toBe("•");
  });
});

describe("projectRailSelections", () => {
  it("contains only visible project and process entries", () => {
    expect(projectRailSelections([project], [tab()]).map((selection) => selection.kind)).toEqual([
      "project",
      "terminal",
    ]);
  });
});

describe("projectRailSummaries", () => {
  it("groups terminal and command tabs with matching selections", () => {
    const summaries = projectRailSummaries(
      [project],
      [
        tab(),
        tab({
          id: "command-1",
          number: 2,
          launch: {
            kind: "command",
            commandId: "dev",
            commandLine: "npm run dev",
            mode: "persistent",
          },
        }),
      ],
      { id: "project-1:command:dev", kind: "command", projectId: project.id, commandId: "dev" },
    );

    expect(summaries[0]).toMatchObject({ name: "Term Deck", selected: true });
    expect(summaries[0]!.tabs).toMatchObject([
      { id: "terminal-1", command: false, selected: false },
      { id: "command-1", command: true, selected: true },
    ]);
  });
});
