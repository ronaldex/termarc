import { watch, type Ref } from "vue";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { adjacentTabId, nextProjectTerminalId, projectTerminalIds } from "../utils/terminalTabs";

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
  selection: Ref<SidebarSelection>;
  focusSidebar: (selection: SidebarSelection) => void;
  selectTerminal: (projectId: string, tabId: string) => void;
  selectAddTerminal: (projectId: string) => void;
  closeTab: (tabId: string) => Promise<void>;
  focusSidebarTree: () => void;
}) {
  let previousTabs = [...options.tabs];

  function cycleTerminal(direction: -1 | 1): void {
    const selection = options.selection.value;
    if (selection.kind !== "terminal") return;

    const nextId = adjacentTabId(
      projectTerminalIds(options.tabs, selection.projectId),
      selection.tabId,
      direction,
    );
    const nextTab = options.tabs.find((tab) => tab.id === nextId);
    if (!nextTab) return;

    options.focusSidebar({
      id: nextTab.id,
      kind: "terminal",
      projectId: nextTab.projectId,
      tabId: nextTab.id,
    });
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
