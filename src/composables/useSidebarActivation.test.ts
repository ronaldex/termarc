import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../types/project";
import type { TerminalTab } from "../types/terminal";
import { useSidebarActivation } from "./useSidebarActivation";

const project: Project = {
  id: "project-1",
  name: "Project",
  directory: "/project",
  commands: [],
};

function setup(tabs: TerminalTab[] = []) {
  const selectTerminal = vi.fn();
  const selectTab = vi.fn();
  const runCommand = vi.fn();
  const startTerminal = vi.fn();
  const createProjectTerminal = vi.fn();
  const activateFamilyTerminal = vi.fn();
  const activateWorkspaceTerminal = vi.fn();
  const clearWorkspaceTerminal = vi.fn();
  const activation = useSidebarActivation({
    projects: ref([project]),
    tabs,
    activeTab: ref(tabs[0]),
    activeTabId: ref(tabs[0]?.id),
    findCommandRun: (projectId, commandId) =>
      tabs.find(
        (tab) =>
          tab.projectId === projectId &&
          tab.launch.kind === "command" &&
          tab.launch.commandId === commandId,
      ),
    setSelection: vi.fn(),
    setDefaultProject: vi.fn(),
    selectTerminal,
    selectTab,
    runCommand,
    startTerminal,
    createProjectTerminal,
    activateFamilyTerminal,
    activateWorkspaceTerminal,
    clearWorkspaceTerminal,
  });
  return {
    ...activation,
    selectTerminal,
    selectTab,
    runCommand,
    startTerminal,
    createProjectTerminal,
    activateFamilyTerminal,
    activateWorkspaceTerminal,
    clearWorkspaceTerminal,
  };
}

describe("useSidebarActivation", () => {
  it("opens an existing shell when a project is activated", () => {
    const tab = {
      id: "terminal-1",
      projectId: project.id,
      launch: { kind: "shell" },
    } as TerminalTab;
    const result = setup([tab]);

    result.activateSidebar({ id: project.id, kind: "project", projectId: project.id });

    expect(result.selectTerminal).toHaveBeenCalledWith(project.id, tab.id);
    expect(result.selectTab).toHaveBeenCalledWith(tab.id);
    expect(result.createProjectTerminal).not.toHaveBeenCalled();
  });

  it("presents a subterminal family as soon as it receives sidebar focus", () => {
    const parent = {
      id: "terminal-1",
      projectId: project.id,
      status: "running",
      launch: { kind: "shell" },
    } as TerminalTab;
    const child = {
      id: "terminal-2",
      projectId: project.id,
      status: "running",
      parentTerminalId: parent.id,
      launch: { kind: "shell" },
    } as TerminalTab;
    const result = setup([parent, child]);

    result.focusSidebar({
      id: child.id,
      kind: "terminal",
      projectId: project.id,
      tabId: child.id,
    });

    expect(result.activateFamilyTerminal).toHaveBeenCalledWith(child);
  });

  it("starts a stopped terminal when it is activated", () => {
    const tab = {
      id: "terminal-1",
      projectId: project.id,
      status: "stopped",
      launch: { kind: "shell" },
    } as TerminalTab;
    const result = setup([tab]);

    result.activateSidebar({
      id: tab.id,
      kind: "terminal",
      projectId: project.id,
      tabId: tab.id,
    });

    expect(result.startTerminal).toHaveBeenCalledWith(tab.id);
    expect(result.selectTab).not.toHaveBeenCalled();
  });

  it("does not restart a stopped normalized child terminal", () => {
    const parent = {
      id: "parent",
      projectId: project.id,
      status: "running",
      launch: { kind: "shell" },
    } as TerminalTab;
    const child = {
      id: "child",
      projectId: project.id,
      status: "stopped",
      parentTerminalId: parent.id,
      launch: { kind: "shell" },
    } as TerminalTab;
    const result = setup([parent, child]);

    result.activateSidebar({
      id: child.id,
      kind: "terminal",
      projectId: project.id,
      tabId: child.id,
    });

    expect(result.selectTab).toHaveBeenCalledWith(child.id);
    expect(result.startTerminal).not.toHaveBeenCalled();
  });

  it("restarts a stale child link as a detached root", () => {
    const tab = {
      id: "stale",
      projectId: project.id,
      status: "stopped",
      parentTerminalId: "gone",
      launch: { kind: "shell" },
    } as TerminalTab;
    const result = setup([tab]);

    result.activateSidebar({ id: tab.id, kind: "terminal", projectId: project.id, tabId: tab.id });

    expect(result.startTerminal).toHaveBeenCalledWith(tab.id);
  });

  it("opens a stopped subagent without treating it as a restartable shell", () => {
    const tab = {
      id: "subagent-1",
      projectId: project.id,
      status: "stopped",
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: "terminal-1",
        name: "Research",
        commandLine: "pi",
        processKind: "pi",
      },
    } as TerminalTab;
    const result = setup([tab]);

    result.activateSidebar({
      id: tab.id,
      kind: "subagent",
      projectId: project.id,
      tabId: tab.id,
      parentTerminalId: "terminal-1",
    });

    expect(result.selectTab).toHaveBeenCalledWith(tab.id);
    expect(result.startTerminal).not.toHaveBeenCalled();
  });

  it("presents an existing agent as soon as it receives sidebar focus", () => {
    const tab = {
      id: "agent-1",
      projectId: project.id,
      status: "running",
      launch: {
        kind: "command",
        commandId: "agent-1",
        commandLine: "pi",
        source: "agent",
      },
    } as TerminalTab;
    const result = setup([tab]);

    result.focusSidebar({
      id: `${project.id}:agent:agent-1`,
      kind: "agent",
      projectId: project.id,
      commandId: "agent-1",
    });

    expect(result.activateWorkspaceTerminal).toHaveBeenCalledWith(tab);
  });

  it("clears the previous terminal when focusing an agent without a tab", () => {
    const result = setup();

    result.focusSidebar({
      id: `${project.id}:agent:new-agent`,
      kind: "agent",
      projectId: project.id,
      commandId: "new-agent",
    });

    expect(result.clearWorkspaceTerminal).toHaveBeenCalledOnce();
  });

  it("runs a command that does not already have an active tab", () => {
    const result = setup();

    result.activateSidebar({
      id: `${project.id}:command:build`,
      kind: "command",
      projectId: project.id,
      commandId: "build",
    });

    expect(result.runCommand).toHaveBeenCalledWith(project.id, "build");
  });
});
