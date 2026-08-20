import { watch, type Ref } from "vue";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { nextProjectTerminalId, projectTerminalIds } from "../utils/terminalTabs";

export function terminalSelectionAfterRemoval(
  previousTabs: readonly TerminalTabState[],
  currentTabs: readonly TerminalTabState[],
  selection: SidebarSelection,
): SidebarSelection | undefined {
  if (selection.kind !== "terminal" || currentTabs.some((tab) => tab.id === selection.tabId)) {
    return;
  }

  const preferredId = nextProjectTerminalId(previousTabs, selection.tabId);
  const nextTerminal =
    currentTabs.find((tab) => tab.id === preferredId) ??
    currentTabs.find((tab) => tab.projectId === selection.projectId && tab.launch.kind === "shell");

  return nextTerminal
    ? {
        id: nextTerminal.id,
        kind: "terminal",
        projectId: nextTerminal.projectId,
        tabId: nextTerminal.id,
      }
    : {
        id: `${selection.projectId}:add-terminal`,
        kind: "add-terminal",
        projectId: selection.projectId,
      };
}

export function useWorkspaceTerminalNavigation(options: {
  tabs: TerminalTabState[];
  projects: Ref<ProjectTreeProject[]>;
  selection: Ref<SidebarSelection>;
  focusSidebar: (selection: SidebarSelection) => void;
  focusContent: () => void;
  selectTab: (tabId: string) => void;
  selectTerminal: (projectId: string, tabId: string) => void;
  selectAddTerminal: (projectId: string) => void;
  closeTab: (tabId: string) => Promise<void>;
  focusSidebarTree: () => void;
}) {
  let previousTabs = [...options.tabs];

  function cycleTerminal(direction: -1 | 1): void {
    const selection = options.selection.value;
    if (selection.kind !== "terminal" && selection.kind !== "agent") return;
    const project = options.projects.value.find((item) => item.id === selection.projectId);
    if (!project) return;

    const entries: SidebarSelection[] = [
      ...(project.agents ?? []).map((agent) => ({
        id: `${project.id}:agent:${agent.id}`,
        kind: "agent" as const,
        projectId: project.id,
        commandId: agent.id,
      })),
      ...projectTerminalIds(options.tabs, project.id).flatMap((tabId) => [
        {
          id: tabId,
          kind: "terminal" as const,
          projectId: project.id,
          tabId,
        },
      ]),
    ];
    if (entries.length < 2) return;
    const currentIndex = entries.findIndex((entry) => {
      if (selection.kind === "agent")
        return entry.kind === "agent" && entry.commandId === selection.commandId;
      return (entry as { tabId?: string }).tabId === (selection as { tabId?: string }).tabId;
    });
    const nextIndex = (Math.max(currentIndex, 0) + direction + entries.length) % entries.length;
    const next = entries[nextIndex];
    if (!next) return;

    options.focusSidebar(next);
    const nextTabId =
      next.kind === "terminal"
        ? next.tabId
        : next.kind === "agent"
          ? options.tabs.find(
              (tab) =>
                tab.projectId === next.projectId &&
                tab.launch.kind === "command" &&
                tab.launch.source === "agent" &&
                tab.launch.commandId === next.commandId,
            )?.id
          : undefined;

    const nextTab = nextTabId ? options.tabs.find((tab) => tab.id === nextTabId) : undefined;
    const needsStartAction =
      nextTab?.launch.kind === "shell" &&
      (nextTab.status === "stopped" || nextTab.status === "error");

    // A stopped shell has no visible xterm to focus; focus its start action
    // instead so the next modifier+Arrow can continue navigation or start it.
    if (nextTabId && !needsStartAction) options.selectTab(nextTabId);
    else requestAnimationFrame(options.focusContent);
  }

  async function closeTerminal(id: string): Promise<void> {
    await options.closeTab(id);
  }

  watch(
    () => options.tabs.map((tab) => tab.id),
    () => {
      const nextSelection = terminalSelectionAfterRemoval(
        previousTabs,
        options.tabs,
        options.selection.value,
      );
      if (nextSelection?.kind === "terminal") {
        options.selectTerminal(nextSelection.projectId, nextSelection.tabId);
        requestAnimationFrame(options.focusSidebarTree);
      } else if (nextSelection?.kind === "add-terminal") {
        options.selectAddTerminal(nextSelection.projectId);
        requestAnimationFrame(options.focusSidebarTree);
      }
      previousTabs = [...options.tabs];
    },
    { flush: "sync" },
  );

  return { cycleTerminal, closeTerminal };
}
