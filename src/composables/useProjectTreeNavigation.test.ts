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

  it("flattens subagents directly after their parent agent", () => {
    const agentProject = {
      ...project,
      agents: [{ id: "pi", name: "Pi", command: "pi" }],
      agentsOpen: true,
    };
    const parent = {
      ...terminal,
      id: "agent-terminal",
      launch: { kind: "command", commandId: "pi", commandLine: "pi", source: "agent" },
    } as TerminalTab;
    const child = {
      ...terminal,
      id: "subagent-terminal",
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: parent.id,
        name: "Research",
        commandLine: "pi",
        processKind: "pi",
      },
    } as TerminalTab;

    const nodes = flattenProjectTree([agentProject], [parent, child]);
    const parentIndex = nodes.findIndex((node) => node.kind === "agent");

    expect(nodes[parentIndex + 1]).toEqual({
      id: child.id,
      kind: "subagent",
      projectId: project.id,
      tabId: child.id,
      parentTerminalId: parent.id,
    });
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

  it("moves between sibling subterminals", () => {
    const agentProject = {
      ...project,
      agents: [{ id: "pi", name: "Pi", command: "pi" }],
      agentsOpen: true,
    };
    const parent = {
      ...terminal,
      id: "agent-terminal",
      launch: { kind: "command", commandId: "pi", commandLine: "pi", source: "agent" },
    } as TerminalTab;
    const children = ["subagent-1", "subagent-2"].map(
      (id) =>
        ({
          ...terminal,
          id,
          launch: {
            kind: "subagent",
            subagentId: id,
            parentTerminalId: parent.id,
            name: id,
            commandLine: "pi",
            processKind: "pi",
          },
        }) as TerminalTab,
    );
    const subterminalNodes = flattenProjectTree([agentProject], [parent, ...children]).filter(
      (node) => node.kind === "subagent",
    );

    expect(
      projectTreeNavigationActions(
        "ArrowDown",
        flattenProjectTree([agentProject], [parent, ...children]),
        subterminalNodes[0]!,
        [agentProject],
      ),
    ).toEqual([{ type: "focus", selection: subterminalNodes[1] }]);
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
