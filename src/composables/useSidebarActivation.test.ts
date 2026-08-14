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
  });
  return { ...activation, selectTerminal, selectTab, runCommand, startTerminal, createProjectTerminal };
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
