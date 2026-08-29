import type { Ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import { normalizedTerminalParentId } from "../utils/terminalHierarchy";

export function useSidebarActivation(options: {
  projects: Ref<Project[]>;
  tabs: TerminalTab[];
  activeTab: Ref<TerminalTab | undefined>;
  activeTabId: Ref<string | undefined>;
  findCommandRun: (
    projectId: string,
    commandId: string,
    source?: "command" | "agent",
  ) => TerminalTab | undefined;
  setSelection: (selection: SidebarSelection) => void;
  setDefaultProject: (projectId: string, directory: string) => void;
  selectTerminal: (projectId: string, tabId: string) => void;
  selectTab: (tabId: string) => void;
  runCommand: (projectId: string, commandId: string) => void;
  runAgent?: (projectId: string, commandId: string) => void;
  startTerminal: (tabId: string) => void;
  createProjectTerminal: (projectId: string, directory: string) => void;
  activateFamilyTerminal?: (tab: TerminalTab) => void;
  activateWorkspaceTerminal?: (tab: TerminalTab) => void;
  clearWorkspaceTerminal?: () => void;
}) {
  function focusSidebar(selection: SidebarSelection): void {
    options.setSelection(selection);
    const projectId = "projectId" in selection ? selection.projectId : undefined;
    const project = options.projects.value.find((item) => item.id === projectId);
    if (project) options.setDefaultProject(project.id, project.directory);
    if (selection.kind === "terminal" || selection.kind === "subagent") {
      options.activeTabId.value = selection.tabId;
      const tab = options.tabs.find((item) => item.id === selection.tabId);
      if (tab) options.activateFamilyTerminal?.(tab);
    }
    if (selection.kind === "command" || selection.kind === "agent") {
      const source = selection.kind === "agent" ? "agent" : "command";
      const tab = options.findCommandRun(selection.projectId, selection.commandId, source);
      if (tab) {
        options.activeTabId.value = tab.id;
        options.activateWorkspaceTerminal?.(tab);
      } else {
        options.clearWorkspaceTerminal?.();
      }
    }
  }

  function activateSidebar(selection: SidebarSelection): void {
    focusSidebar(selection);
    if (selection.kind === "terminal" || selection.kind === "subagent") {
      const tab = options.tabs.find((item) => item.id === selection.tabId);
      if (
        selection.kind === "terminal" &&
        (tab?.status === "stopped" || tab?.status === "error") &&
        !normalizedTerminalParentId(options.tabs, tab)
      ) {
        options.startTerminal(tab.id);
      } else if (tab) {
        options.selectTab(selection.tabId);
      }
      return;
    }
    if (selection.kind === "command" || selection.kind === "agent") {
      const source = selection.kind === "agent" ? "agent" : "command";
      const tab = options.findCommandRun(selection.projectId, selection.commandId, source);
      if (tab && (tab.status === "starting" || tab.status === "running")) {
        options.selectTab(tab.id);
      } else if (selection.kind === "agent") {
        options.runAgent?.(selection.projectId, selection.commandId);
      } else {
        options.runCommand(selection.projectId, selection.commandId);
      }
      return;
    }
    if (selection.kind === "add-terminal") {
      const project = options.projects.value.find((item) => item.id === selection.projectId);
      if (project) options.createProjectTerminal(project.id, project.directory);
      return;
    }
    if (selection.kind === "project" || selection.kind === "terminals") {
      const tab =
        (options.activeTab.value?.projectId === selection.projectId &&
        options.activeTab.value.launch.kind === "shell"
          ? options.activeTab.value
          : undefined) ??
        options.tabs.find(
          (item) => item.projectId === selection.projectId && item.launch.kind === "shell",
        );
      if (tab) {
        options.selectTerminal(selection.projectId, tab.id);
        options.selectTab(tab.id);
        return;
      }
      const project = options.projects.value.find((item) => item.id === selection.projectId);
      if (project) options.createProjectTerminal(project.id, project.directory);
    }
  }

  return { focusSidebar, activateSidebar };
}
