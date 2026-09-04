import { watch, type Ref } from "vue";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import {
  numberedSidebarShortcuts,
  sidebarShortcutKey,
  type SidebarShortcutSelection,
} from "../utils/sidebarShortcuts";
import { normalizedTerminalFamilyModel } from "../utils/terminalFamily";

export function terminalCycleNeedsWorkspaceFocus(
  tab: TerminalTabState | undefined,
  tabs: readonly TerminalTabState[] = tab ? [tab] : [],
): boolean {
  if (!tab) return true;
  const node = normalizedTerminalFamilyModel(tabs).nodes.find(
    (candidate) => candidate.id === tab.id,
  );
  return Boolean(
    tab.launch.kind === "shell" &&
    (tab.status === "stopped" || tab.status === "error") &&
    !node?.parentTerminalId,
  );
}

export function terminalSelectionAfterRemoval(
  previousTabs: readonly TerminalTabState[],
  currentTabs: readonly TerminalTabState[],
  selection: SidebarSelection,
  projects: readonly ProjectTreeProject[],
): SidebarSelection | undefined {
  if (
    (selection.kind !== "terminal" && selection.kind !== "subagent") ||
    currentTabs.some((tab) => tab.id === selection.tabId)
  ) {
    return;
  }

  const previousShortcuts = numberedSidebarShortcuts(projects, previousTabs).map(
    ({ selection: shortcutSelection }) => shortcutSelection,
  );
  const removedIndex = previousShortcuts.findIndex(
    (shortcutSelection) =>
      (shortcutSelection.kind === "terminal" || shortcutSelection.kind === "subagent") &&
      shortcutSelection.tabId === selection.tabId,
  );
  const preceding = removedIndex > 0 ? previousShortcuts[removedIndex - 1] : undefined;
  const currentShortcutKeys = new Set(
    numberedSidebarShortcuts(projects, currentTabs).map(({ selection: shortcutSelection }) =>
      sidebarShortcutKey(shortcutSelection),
    ),
  );
  if (
    preceding &&
    isCloseFocusTarget(preceding) &&
    currentShortcutKeys.has(sidebarShortcutKey(preceding))
  ) {
    return preceding;
  }

  if (selection.kind === "subagent") {
    const previousModel = normalizedTerminalFamilyModel(previousTabs);
    const selectedNode = previousModel.nodes.find((node) => node.id === selection.tabId);
    const siblings = previousModel.nodes
      .filter(
        (node) =>
          node.parentTerminalId === selectedNode?.parentTerminalId &&
          node.tab.launch.kind === "subagent",
      )
      .map((node) => node.tab);
    const siblingIndex = siblings.findIndex((tab) => tab.id === selection.tabId);
    const sibling =
      siblings
        .slice(siblingIndex + 1)
        .find((tab) => currentTabs.some((current) => current.id === tab.id)) ??
      siblings
        .slice(0, siblingIndex)
        .reverse()
        .find((tab) => currentTabs.some((current) => current.id === tab.id));
    if (sibling?.launch.kind === "subagent") {
      return {
        id: sibling.id,
        kind: "subagent",
        projectId: sibling.projectId,
        tabId: sibling.id,
        parentTerminalId: sibling.launch.parentTerminalId,
      };
    }

    const parent = selectedNode?.parentTerminalId
      ? currentTabs.find((tab) => tab.id === selectedNode.parentTerminalId)
      : undefined;
    if (parent?.launch.kind === "command") {
      const kind = parent.launch.source === "agent" ? "agent" : "command";
      return {
        id: `${parent.projectId}:${kind}:${parent.launch.commandId}`,
        kind,
        projectId: parent.projectId,
        commandId: parent.launch.commandId,
      };
    }
    if (parent) {
      return {
        id: parent.id,
        kind: "terminal",
        projectId: parent.projectId,
        tabId: parent.id,
      };
    }
  }

  const preferredId = nextNormalizedProjectTerminalId(previousTabs, selection.tabId);
  const nextTerminal =
    currentTabs.find((tab) => tab.id === preferredId) ??
    normalizedProjectShellIds(currentTabs, selection.projectId)
      .map((id) => currentTabs.find((tab) => tab.id === id))
      .find((tab): tab is TerminalTabState => Boolean(tab));

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

function isCloseFocusTarget(
  selection: SidebarShortcutSelection,
): selection is Extract<SidebarShortcutSelection, { kind: "agent" | "subagent" | "terminal" }> {
  return (
    selection.kind === "agent" || selection.kind === "subagent" || selection.kind === "terminal"
  );
}

function normalizedProjectShellIds(tabs: readonly TerminalTabState[], projectId: string): string[] {
  const nodes = normalizedTerminalFamilyModel(tabs).nodes.filter(
    (node) => node.tab.projectId === projectId && node.tab.launch.kind === "shell",
  );
  return nodes.flatMap((root) =>
    root.parentTerminalId
      ? []
      : [
          root.id,
          ...nodes.filter((node) => node.parentTerminalId === root.id).map((node) => node.id),
        ],
  );
}

function nextNormalizedProjectTerminalId(
  tabs: readonly TerminalTabState[],
  closingId: string,
): string | undefined {
  const closing = tabs.find((tab) => tab.id === closingId);
  if (!closing || closing.launch.kind !== "shell") return undefined;
  const ids = normalizedProjectShellIds(tabs, closing.projectId);
  const index = ids.indexOf(closingId);
  return index >= 0 && ids.length > 1 ? ids[(index + 1) % ids.length] : undefined;
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

  function cycleTerminal(direction: -1 | 1, includeChildren: boolean): void {
    const selection = options.selection.value;
    if (
      selection.kind !== "terminal" &&
      selection.kind !== "agent" &&
      selection.kind !== "subagent"
    )
      return;
    const project = options.projects.value.find((item) => item.id === selection.projectId);
    if (!project) return;

    const entries: SidebarSelection[] = numberedSidebarShortcuts([project], options.tabs)
      .map(({ selection }) => selection)
      .filter(
        (entry) => entry.kind === "agent" || entry.kind === "terminal" || entry.kind === "subagent",
      );
    const selectedTabId = "tabId" in selection ? selection.tabId : undefined;
    const familyModel = normalizedTerminalFamilyModel(options.tabs);
    const nodeById = new Map(familyModel.nodes.map((node) => [node.id, node]));
    const selectedNode = selectedTabId ? nodeById.get(selectedTabId) : undefined;
    const familyRootId =
      selection.kind === "agent"
        ? options.tabs.find(
            (tab) =>
              tab.projectId === selection.projectId &&
              tab.launch.kind === "command" &&
              tab.launch.source === "agent" &&
              tab.launch.commandId === selection.commandId,
          )?.id
        : selectedNode?.rootTabId;
    const isEligible = (entry: SidebarSelection): boolean => {
      if (!includeChildren)
        return (
          entry.kind === "agent" ||
          (entry.kind === "terminal" && !nodeById.get(entry.tabId)?.parentTerminalId)
        );
      if (!familyRootId) return false;
      if (entry.kind === "agent") {
        return options.tabs.some(
          (tab) =>
            tab.id === familyRootId &&
            tab.launch.kind === "command" &&
            tab.launch.source === "agent" &&
            tab.launch.commandId === entry.commandId,
        );
      }
      return "tabId" in entry && nodeById.get(entry.tabId)?.rootTabId === familyRootId;
    };
    if (!entries.some(isEligible)) return;

    const currentIndex = entries.findIndex((entry) => {
      if (selection.kind === "agent")
        return entry.kind === "agent" && entry.commandId === selection.commandId;
      return "tabId" in entry && entry.tabId === selectedTabId;
    });
    const startIndex = Math.max(currentIndex, 0);
    const next = Array.from({ length: entries.length - 1 }, (_, offset) => {
      const index = (startIndex + direction * (offset + 1) + entries.length) % entries.length;
      return entries[index];
    }).find((entry): entry is SidebarSelection => Boolean(entry && isEligible(entry)));
    if (!next) return;

    options.focusSidebar(next);
    const nextTabId =
      next.kind === "terminal" || next.kind === "subagent"
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

    // A stopped root shell uses the workspace start action. Stopped child
    // shells are presented and focused by activateFamilyTerminal in the right sidebar.
    if (nextTabId && !needsStartAction) options.selectTab(nextTabId);
    else if (terminalCycleNeedsWorkspaceFocus(nextTab, options.tabs))
      requestAnimationFrame(options.focusContent);
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
        options.projects.value,
      );
      if (
        nextSelection?.kind === "terminal" ||
        nextSelection?.kind === "subagent" ||
        nextSelection?.kind === "agent" ||
        nextSelection?.kind === "command"
      ) {
        options.focusSidebar(nextSelection);
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
