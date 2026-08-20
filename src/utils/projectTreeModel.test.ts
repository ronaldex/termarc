import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { flattenProjectTreeModel, projectTreeModel } from "./projectTreeModel";

const project: ProjectTreeProject = {
  id: "project",
  name: "Project",
  directory: "/project",
  commands: [{ id: "build", name: "Build", command: "npm run build" }],
  projectOpen: true,
  terminalOpen: true,
  commandsOpen: true,
};

function tab(overrides: Partial<TerminalTabState>): TerminalTabState {
  return {
    id: "terminal",
    number: 1,
    title: "Terminal",
    projectId: project.id,
    cwd: project.directory,
    launch: { kind: "shell" },
    status: "running",
    detail: "running",
    ...overrides,
  } as TerminalTabState;
}

describe("projectTreeModel", () => {
  it("builds terminal and command rows in one pass", () => {
    const commandTab = tab({
      id: "command",
      launch: {
        kind: "command",
        commandId: "build",
        commandLine: "npm run build",
      },
    });
    const [model] = projectTreeModel([project], [tab({}), commandTab]);

    expect(model?.terminalTabs.map((item) => item.id)).toEqual(["terminal"]);
    expect(model?.hasTerminals).toBe(true);
    expect(model?.commandItems[0]?.tab).toBe(commandTab);
  });

  it("keeps agents separate from commands with the same ID", () => {
    const projectWithAgent: ProjectTreeProject = {
      ...project,
      agents: [{ id: "build", name: "Build agent", command: "pi" }],
      agentsOpen: true,
    };
    const commandTab = tab({
      id: "command",
      launch: { kind: "command", commandId: "build", commandLine: "npm run build" },
    });
    const agentTab = tab({
      id: "agent",
      launch: {
        kind: "command",
        commandId: "build",
        commandLine: "pi",
        source: "agent",
      },
    });

    const [model] = projectTreeModel([projectWithAgent], [commandTab, agentTab]);

    expect(model?.commandItems[0]?.tab).toBe(commandTab);
    expect(model?.agentItems[0]?.tab).toBe(agentTab);
    expect(flattenProjectTreeModel(model ? [model] : [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "agents" }),
        expect.objectContaining({ kind: "agent", commandId: "build" }),
      ]),
    );
  });

  it("keeps add-terminal hidden when filtering an existing terminal", () => {
    const [model] = projectTreeModel([project], [tab({})], "missing");

    expect(model?.terminalTabs).toEqual([]);
    expect(model?.hasTerminals).toBe(true);
    expect(
      flattenProjectTreeModel(model ? [model] : []).some((item) => item.kind === "add-terminal"),
    ).toBe(false);
  });
});
