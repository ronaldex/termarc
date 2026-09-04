import { describe, expect, it } from "vitest";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import {
  terminalCycleNeedsWorkspaceFocus,
  terminalSelectionAfterRemoval,
} from "./useWorkspaceTerminalNavigation";

function terminal(id: string, projectId = "project-a"): TerminalTabState {
  return {
    id,
    projectId,
    number: 1,
    title: id,
    detail: "",
    cwd: ".",
    launch: { kind: "shell" },
    status: "running",
  };
}

function selected(tab: TerminalTabState): SidebarSelection {
  return { id: tab.id, kind: "terminal", projectId: tab.projectId, tabId: tab.id };
}

function project(options: Partial<ProjectTreeProject> = {}): ProjectTreeProject {
  return {
    id: "project-a",
    name: "Project A",
    directory: ".",
    projectOpen: true,
    terminalOpen: true,
    commandsOpen: true,
    agentsOpen: true,
    ...options,
  };
}

describe("terminal cycle focus", () => {
  it("keeps stopped child focus in the right sidebar", () => {
    const root = { ...terminal("root"), status: "stopped" as const };
    const child = {
      ...terminal("child"),
      status: "stopped" as const,
      parentTerminalId: root.id,
    };

    expect(terminalCycleNeedsWorkspaceFocus(undefined)).toBe(true);
    expect(terminalCycleNeedsWorkspaceFocus(root, [root, child])).toBe(true);
    expect(terminalCycleNeedsWorkspaceFocus(child, [root, child])).toBe(false);
  });
});

describe("terminalSelectionAfterRemoval", () => {
  it("does not change selection when a background terminal closes", () => {
    const active = terminal("active");
    const background = terminal("background");

    expect(
      terminalSelectionAfterRemoval([active, background], [active], selected(active), [project()]),
    ).toBe(undefined);
  });

  it("selects the preferred sibling when the selected terminal closes", () => {
    const closing = terminal("closing");
    const next = terminal("next");

    expect(
      terminalSelectionAfterRemoval([closing, next], [next], selected(closing), [project()]),
    ).toEqual(selected(next));
  });

  it("focuses an agent immediately above a closed terminal", () => {
    const agentTab = {
      ...terminal("agent-tab"),
      launch: {
        kind: "command" as const,
        commandId: "agent-1",
        commandLine: "pi",
        source: "agent" as const,
      },
    };
    const closing = terminal("closing");

    expect(
      terminalSelectionAfterRemoval([agentTab, closing], [agentTab], selected(closing), [
        project({ agents: [{ id: "agent-1", name: "Agent", command: "pi" }] }),
      ]),
    ).toEqual({
      id: "project-a:agent:agent-1",
      kind: "agent",
      projectId: "project-a",
      commandId: "agent-1",
    });
  });

  it("uses normalized rendered order after removing a terminal with invalid links", () => {
    const root = terminal("root");
    const child = { ...terminal("child"), parentTerminalId: root.id };
    const deep = { ...terminal("deep"), parentTerminalId: child.id };
    const stale = { ...terminal("stale"), parentTerminalId: "gone" };

    expect(
      terminalSelectionAfterRemoval(
        [root, child, deep, stale],
        [root, child, stale],
        selected(deep),
        [project()],
      ),
    ).toEqual(selected(child));
  });

  it("returns to a subagent sibling and then its parent when children close", () => {
    const parent = terminal("parent");
    const child = {
      ...terminal("child"),
      launch: {
        kind: "subagent" as const,
        subagentId: "subagent-1",
        parentTerminalId: parent.id,
        name: "Child",
        commandLine: "pi",
        processKind: "pi",
      },
    };
    const sibling = {
      ...child,
      id: "sibling",
      launch: { ...child.launch, subagentId: "subagent-2" },
    };
    const childSelection: SidebarSelection = {
      id: child.id,
      kind: "subagent",
      projectId: child.projectId,
      tabId: child.id,
      parentTerminalId: parent.id,
    };

    expect(
      terminalSelectionAfterRemoval([parent, child, sibling], [parent, sibling], childSelection, [
        project(),
      ]),
    ).toEqual({
      id: sibling.id,
      kind: "subagent",
      projectId: sibling.projectId,
      tabId: sibling.id,
      parentTerminalId: parent.id,
    });
    expect(
      terminalSelectionAfterRemoval([parent, child], [parent], childSelection, [project()]),
    ).toEqual(selected(parent));
  });

  it("focuses the preceding subagent when a later sibling closes", () => {
    const parent = terminal("parent");
    const first = {
      ...terminal("first"),
      launch: {
        kind: "subagent" as const,
        subagentId: "subagent-1",
        parentTerminalId: parent.id,
        name: "First",
        commandLine: "pi",
        processKind: "pi",
      },
    };
    const closing = {
      ...first,
      id: "closing",
      launch: { ...first.launch, subagentId: "subagent-2" },
    };
    const closingSelection: SidebarSelection = {
      id: closing.id,
      kind: "subagent",
      projectId: closing.projectId,
      tabId: closing.id,
      parentTerminalId: parent.id,
    };

    expect(
      terminalSelectionAfterRemoval([parent, first, closing], [parent, first], closingSelection, [
        project(),
      ]),
    ).toEqual({
      id: first.id,
      kind: "subagent",
      projectId: first.projectId,
      tabId: first.id,
      parentTerminalId: parent.id,
    });
  });

  it("treats a stale subagent link as detached when selecting after removal", () => {
    const detached = {
      ...terminal("detached"),
      launch: {
        kind: "subagent" as const,
        subagentId: "detached-agent",
        parentTerminalId: "missing",
        name: "Detached",
        commandLine: "pi",
        processKind: "pi",
      },
    };
    const selection: SidebarSelection = {
      id: detached.id,
      kind: "subagent",
      projectId: detached.projectId,
      tabId: detached.id,
      parentTerminalId: "missing",
    };

    expect(terminalSelectionAfterRemoval([detached], [], selection, [project()])).toEqual({
      id: "project-a:add-terminal",
      kind: "add-terminal",
      projectId: "project-a",
    });
  });

  it("falls back to add terminal when the project has no shell left", () => {
    const closing = terminal("closing");

    expect(terminalSelectionAfterRemoval([closing], [], selected(closing), [project()])).toEqual({
      id: "project-a:add-terminal",
      kind: "add-terminal",
      projectId: "project-a",
    });
  });
});
