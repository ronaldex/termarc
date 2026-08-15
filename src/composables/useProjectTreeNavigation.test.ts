import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import { flattenProjectTree, projectTreeNavigationActions } from "./useProjectTreeNavigation";

const project: ProjectTreeProject = {
  id: "project-1",
  name: "Project",
  directory: "/project",
  commands: [
    {
      id: "command-1",
      name: "Build",
      command: "npm run build",
    },
  ],
  projectOpen: true,
  terminalOpen: true,
  commandsOpen: true,
};
const terminal = {
  id: "terminal-1",
  number: 1,
  title: "Terminal 1",
  projectId: project.id,
  cwd: project.directory,
  launch: { kind: "shell" },
} as TerminalTab;

function selection(id: string, kind: "project" | "terminal"): SidebarSelection {
  return kind === "terminal"
    ? { id, kind, projectId: project.id, tabId: id }
    : { id, kind, projectId: project.id };
}

describe("flattenProjectTree", () => {
  it("returns all visible and actionable rows in display order", () => {
    expect(flattenProjectTree([project], [terminal]).map((node) => node.kind)).toEqual([
      "project",
      "terminals",
      "terminal",
      "commands",
      "command",
    ]);
  });

  it("hides the commands section when a project has no commands", () => {
    const nodes = flattenProjectTree([{ ...project, commands: [] }], [terminal]);

    expect(nodes.some((node) => node.kind === "commands" || node.kind === "command")).toBe(false);
  });

  it("keeps section headings visible when all project sections are collapsed", () => {
    expect(
      flattenProjectTree(
        [{ ...project, terminalOpen: false, commandsOpen: false }],
        [terminal],
      ).map((node) => node.kind),
    ).toEqual(["project", "terminals", "commands"]);
  });

  it("hides all sections when the project is collapsed", () => {
    expect(
      flattenProjectTree([{ ...project, projectOpen: false }], [terminal]).map((node) => node.kind),
    ).toEqual(["project"]);
  });

  it("only includes the add-terminal action when the project has no terminals", () => {
    const filteredNodes = flattenProjectTree([project], [terminal], "missing");
    expect(filteredNodes.some((node) => node.kind === "terminal")).toBe(false);
    expect(filteredNodes.some((node) => node.kind === "add-terminal")).toBe(false);

    const emptyNodes = flattenProjectTree([project], []);
    expect(emptyNodes.some((node) => node.kind === "add-terminal")).toBe(true);
  });
});

describe("projectTreeNavigationActions", () => {
  const nodes = flattenProjectTree([project], [terminal]);

  it("moves to the next visible row", () => {
    expect(
      projectTreeNavigationActions("ArrowDown", nodes, selection(project.id, "project"), [project]),
    ).toEqual([{ type: "focus", selection: nodes[1] }]);
  });

  it("expands a collapsed project without changing its section state", () => {
    const collapsed = {
      ...project,
      projectOpen: false,
      terminalOpen: false,
      commandsOpen: false,
    };
    expect(
      projectTreeNavigationActions(
        "ArrowRight",
        flattenProjectTree([collapsed], [terminal]),
        selection(project.id, "project"),
        [collapsed],
      ),
    ).toEqual([{ type: "toggle-project", projectId: project.id }]);
  });

  it("activates a command with ArrowRight", () => {
    const command = nodes.find((node) => node.kind === "command")!;
    expect(projectTreeNavigationActions("ArrowRight", nodes, command, [project])).toEqual([
      { type: "activate", selection: command },
    ]);
  });

  it("activates the focused row with Enter", () => {
    const terminalSelection = selection(terminal.id, "terminal");

    expect(projectTreeNavigationActions("Enter", nodes, terminalSelection, [project])).toEqual([
      { type: "activate", selection: terminalSelection },
    ]);
  });
});
