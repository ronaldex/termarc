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

    expect(model?.terminalItems.map((item) => item.id)).toEqual(["terminal"]);
    expect(model?.hasTerminals).toBe(true);
    expect(model?.commandItems[0]?.tab).toBe(commandTab);
  });

  it("groups shell children beneath their terminal parent", () => {
    const parent = tab({ id: "parent" });
    const child = tab({ id: "child", parentTerminalId: parent.id });
    const [model] = projectTreeModel([project], [parent, child]);

    expect(model?.terminalItems.map((item) => item.id)).toEqual(["parent"]);
    expect(model?.terminalItems).toEqual([
      expect.objectContaining({
        tab: parent,
        children: [expect.objectContaining({ tab: child, children: [] })],
      }),
    ]);
    expect(model?.counts.terminals).toEqual({ active: 2, total: 2 });
    expect(model?.terminalNodes.map((item) => item.id)).toEqual(["parent", "child"]);
    expect(
      flattenProjectTreeModel(model ? [model] : [])
        .filter((item) => item.kind === "terminal")
        .map((item) => item.id),
    ).toEqual(model?.terminalNodes.map((item) => item.id));
  });

  it("promotes invalid descendants so flattened order contains only rendered rows", () => {
    const parent = tab({ id: "parent" });
    const child = tab({ id: "child", parentTerminalId: parent.id });
    const grandchild = tab({ id: "grandchild", parentTerminalId: child.id });
    const orphan = tab({ id: "orphan", parentTerminalId: "missing" });
    const [model] = projectTreeModel([project], [parent, child, grandchild, orphan]);

    expect(model?.terminalItems.map((item) => item.tab.id)).toEqual([
      "parent",
      "grandchild",
      "orphan",
    ]);
    expect(model?.terminalItems[0]?.children.map((item) => item.tab.id)).toEqual(["child"]);
    expect(
      flattenProjectTreeModel(model ? [model] : [])
        .filter((item) => item.kind === "terminal")
        .map((item) => item.tabId),
    ).toEqual(["parent", "child", "grandchild", "orphan"]);
  });

  it("uses normalized nodes as the rendered order for stale, cyclic, and deep links", () => {
    const root = tab({ id: "root" });
    const child = tab({ id: "child", parentTerminalId: root.id });
    const deep = tab({ id: "deep", parentTerminalId: child.id });
    const stale = tab({ id: "stale", parentTerminalId: "gone" });
    const cycleA = tab({ id: "cycle-a", parentTerminalId: "cycle-b" });
    const cycleB = tab({ id: "cycle-b", parentTerminalId: "cycle-a" });
    const [model] = projectTreeModel([project], [root, child, deep, stale, cycleA, cycleB]);

    // ProjectTree renders root shell rows from terminalNodes and their canonical children.
    expect(model?.terminalNodes.map((node) => node.id)).toEqual([
      "root",
      "child",
      "deep",
      "stale",
      "cycle-a",
      "cycle-b",
    ]);
    expect(model?.terminalNodes.filter((node) => !node.parentId).map((node) => node.id)).toEqual([
      "root",
      "deep",
      "stale",
      "cycle-a",
      "cycle-b",
    ]);
    expect(
      flattenProjectTreeModel(model ? [model] : [])
        .filter((selection) => selection.kind === "terminal")
        .map((selection) => selection.tabId),
    ).toEqual(model?.terminalNodes.map((node) => node.id));
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

  it("nests runtime subagents under their configured or terminal parent", () => {
    const projectWithAgent: ProjectTreeProject = {
      ...project,
      agents: [{ id: "pi", name: "Main agent", command: "pi" }],
      agentsOpen: true,
    };
    const agentTab = tab({
      id: "agent",
      launch: { kind: "command", commandId: "pi", commandLine: "pi", source: "agent" },
    });
    const shellParent = tab({ id: "shell-parent" });
    const agentChild = tab({
      id: "research",
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: agentTab.id,
        name: "Research authentication",
        commandLine: "pi research",
        processKind: "pi",
      },
    });
    const shellChild = tab({
      id: "tests",
      launch: {
        kind: "subagent",
        subagentId: "subagent-2",
        parentTerminalId: shellParent.id,
        name: "Add integration tests",
        commandLine: "pi tests",
        processKind: "pi",
      },
    });
    const detachedChild = tab({
      id: "standalone",
      launch: {
        kind: "subagent",
        subagentId: "subagent-3",
        name: "Standalone research",
        commandLine: "pi standalone",
        processKind: "pi",
      },
    });

    const [model] = projectTreeModel(
      [projectWithAgent],
      [agentTab, shellParent, agentChild, shellChild, detachedChild],
    );

    expect(model?.agentItems[0]?.terminalItems.map((item) => item.tab)).toEqual([agentChild]);
    expect(model?.runtimeAgentParents[0]?.tab).toBe(shellParent);
    expect(model?.runtimeAgentParents[0]?.terminalItems.map((item) => item.tab)).toEqual([
      shellChild,
    ]);
    expect(model?.detachedAgentItems.map((item) => item.tab)).toEqual([detachedChild]);
    const selections = flattenProjectTreeModel(model ? [model] : []);
    expect(selections.map((selection) => [selection.kind, selection.id])).toEqual(
      expect.arrayContaining([
        ["agent", "project:agent:pi"],
        ["subagent", "research"],
        ["subagent", "tests"],
        ["subagent", "standalone"],
      ]),
    );
    expect(selections.filter((selection) => selection.id === "tests")).toHaveLength(1);
  });

  it("filters subagents by their runtime name while retaining their parent", () => {
    const parent = tab({ id: "parent" });
    const matching = tab({
      id: "matching",
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: parent.id,
        name: "Research authentication",
        commandLine: "pi",
        processKind: "pi",
      },
    });
    const hidden = tab({
      id: "hidden",
      launch: {
        kind: "subagent",
        subagentId: "subagent-2",
        parentTerminalId: parent.id,
        name: "Write docs",
        commandLine: "pi",
        processKind: "pi",
      },
    });

    const [model] = projectTreeModel(
      [{ ...project, agentsOpen: true }],
      [parent, matching, hidden],
      "authentication",
    );

    expect(model?.runtimeAgentParents[0]?.terminalItems.map((item) => item.tab)).toEqual([
      matching,
    ]);
    expect(
      flattenProjectTreeModel(model ? [model] : []).some((node) => node.id === "matching"),
    ).toBe(true);
    expect(flattenProjectTreeModel(model ? [model] : []).some((node) => node.id === "hidden")).toBe(
      false,
    );
  });

  it("retains matching nested terminal descendants in the rendered root model", () => {
    const parent = tab({ id: "parent", title: "Shell" });
    const child = tab({
      id: "child",
      title: "Deploy API",
      parentTerminalId: parent.id,
    });
    const [model] = projectTreeModel([project], [parent, child], "deploy");

    expect(model?.terminalItems.map((item) => item.tab)).toEqual([parent]);
    expect(model?.terminalItems).toEqual([
      expect.objectContaining({
        tab: parent,
        children: [expect.objectContaining({ tab: child, children: [] })],
      }),
    ]);
    expect(flattenProjectTreeModel(model ? [model] : []).map((node) => node.id)).toEqual(
      expect.arrayContaining(["parent", "child"]),
    );
  });

  it("keeps add-terminal hidden when filtering an existing terminal", () => {
    const [model] = projectTreeModel([project], [tab({})], "missing");

    expect(model?.terminalItems).toEqual([]);
    expect(model?.hasTerminals).toBe(true);
    expect(
      flattenProjectTreeModel(model ? [model] : []).some((item) => item.kind === "add-terminal"),
    ).toBe(false);
  });
});
