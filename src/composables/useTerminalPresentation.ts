import { computed, type Ref } from "vue";
import type { TerminalTabState } from "../types/terminal";
import { sidebarTerminalIds, terminalFamilyForTab } from "../utils/terminalFamily";

export function useTerminalPresentation(options: {
  tabs: readonly TerminalTabState[];
  activeTabId: Ref<string | undefined>;
  mainTerminalId: Ref<string | undefined>;
  selectTab: (id: string) => void;
  focusTerminal: () => void;
  focusWorkspaceContent: () => void;
  focusSidebarPanel: () => void | Promise<void>;
  fitAfterLayout: () => void | Promise<void>;
  resetRightSidebarMode: () => void;
}) {
  const family = computed(() => terminalFamilyForTab(options.tabs, options.mainTerminalId.value));
  const sidebarIds = computed(() => sidebarTerminalIds(family.value, options.mainTerminalId.value));

  function present(tabId: string, maximize = false): void {
    const nextFamily = terminalFamilyForTab(options.tabs, tabId);
    if (!nextFamily) return;
    const previousMainId = options.mainTerminalId.value;
    const currentFamily = terminalFamilyForTab(options.tabs, previousMainId);
    const sameFamily = nextFamily.rootTabId === currentFamily?.rootTabId;
    if (
      maximize ||
      !sameFamily ||
      !previousMainId ||
      !nextFamily.memberTabIds.includes(previousMainId)
    ) {
      options.mainTerminalId.value = maximize ? tabId : nextFamily.rootTabId;
    }
    if (options.mainTerminalId.value !== previousMainId) options.resetRightSidebarMode();
  }

  function focusFamily(tabId: string): void {
    const tab = options.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    present(tab.id);
    if (tab.launch.kind === "shell" && tab.status === "stopped") {
      options.activeTabId.value = tab.id;
    } else options.selectTab(tab.id);
  }

  function maximize(tabId: string): void {
    present(tabId, true);
    options.selectTab(tabId);
    void options.fitAfterLayout();
  }

  function focusMain(): void {
    const tab = options.tabs.find((candidate) => candidate.id === options.mainTerminalId.value);
    if (!tab) {
      options.focusWorkspaceContent();
      return;
    }
    if (tab.launch.kind === "shell" && tab.status === "stopped") {
      options.activeTabId.value = tab.id;
      requestAnimationFrame(options.focusWorkspaceContent);
      return;
    }
    options.selectTab(tab.id);
    requestAnimationFrame(options.focusTerminal);
  }

  function cycle(direction: -1 | 1, includeMain: boolean): void {
    const mainId = options.mainTerminalId.value;
    const ids = includeMain && mainId ? [mainId, ...sidebarIds.value] : sidebarIds.value;
    if (!ids.length) return;
    const index = ids.indexOf(options.activeTabId.value ?? "");
    const nextIndex =
      index < 0
        ? direction === 1
          ? 0
          : ids.length - 1
        : (index + direction + ids.length) % ids.length;
    const nextId = ids[nextIndex];
    if (!nextId) return;
    if (nextId === mainId) focusMain();
    else {
      focusFamily(nextId);
      requestAnimationFrame(() => void options.focusSidebarPanel());
    }
  }

  function selectAfterClose(closedId: string, formerMemberIds: readonly string[]): void {
    const promotedId = formerMemberIds.find((id) => options.tabs.some((tab) => tab.id === id));
    if (promotedId) {
      options.mainTerminalId.value = promotedId;
      options.selectTab(promotedId);
      return;
    }
    const fallback =
      options.tabs.find((tab) => tab.id === options.activeTabId.value && tab.id !== closedId) ??
      options.tabs[0];
    if (fallback) {
      present(fallback.id, true);
      options.selectTab(fallback.id);
    } else options.mainTerminalId.value = undefined;
  }

  return { family, sidebarIds, present, focusFamily, maximize, focusMain, cycle, selectAfterClose };
}
