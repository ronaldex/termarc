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
      mode: "single-shot",
    },
  ],
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
      "add-terminal",
      "commands",
      "command",
    ]);
  });

  it("hides the commands section when a project has no commands", () => {
    const nodes = flattenProjectTree([{ ...project, commands: [] }], [terminal]);

    expect(nodes.some((node) => node.kind === "commands" || node.kind === "command")).toBe(false);
  });

  it("contains only the project when it is fully collapsed", () => {
    expect(
      flattenProjectTree(
        [{ ...project, terminalOpen: false, commandsOpen: false }],
        [terminal],
      ).map((node) => node.kind),
    ).toEqual(["project"]);
  });

  it("filters terminal rows without removing section actions", () => {
    const nodes = flattenProjectTree([project], [terminal], "missing");
    expect(nodes.some((node) => node.kind === "terminal")).toBe(false);
    expect(nodes.some((node) => node.kind === "add-terminal")).toBe(true);
  });
});

describe("projectTreeNavigationActions", () => {
  const nodes = flattenProjectTree([project], [terminal]);

  it("moves to the next visible row", () => {
    expect(
      projectTreeNavigationActions(
        "ArrowDown",
        nodes,
        selection(project.id, "project"),
        [project],
        true,
      ),
    ).toEqual([{ type: "focus", selection: nodes[1] }]);
  });

  it("expands collapsed project sections", () => {
    const collapsed = { ...project, terminalOpen: false, commandsOpen: false };
    expect(
      projectTreeNavigationActions(
        "ArrowRight",
        flattenProjectTree([collapsed], [terminal]),
        selection(project.id, "project"),
        [collapsed],
        true,
      ),
    ).toEqual([
      { type: "toggle-terminals", projectId: project.id },
      { type: "toggle-commands", projectId: project.id },
    ]);
  });

  it("activates a command with ArrowRight", () => {
    const command = nodes.find((node) => node.kind === "command")!;
    expect(projectTreeNavigationActions("ArrowRight", nodes, command, [project], true)).toEqual([
      { type: "activate", selection: command },
    ]);
  });

  it("returns terminal focus from xterm to the tree", () => {
    expect(
      projectTreeNavigationActions(
        "ArrowLeft",
        nodes,
        selection(terminal.id, "terminal"),
        [project],
        false,
      ),
    ).toEqual([{ type: "focus", selection: nodes[2] }]);
  });
});
