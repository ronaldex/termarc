import { ref, type Ref } from "vue";
import type { TerminalTab } from "../types/terminal";
import {
  activeDirectSubagentTabs,
  parentClosePlan,
  type ParentCloseChoice,
} from "../utils/parentClose";
import { terminalFamilyForTab } from "../utils/terminalFamily";

export function useTerminalFamilyClose(options: {
  tabs: TerminalTab[];
  activeTabId: Ref<string | undefined>;
  mainTerminalId: Ref<string | undefined>;
  ask: (childCount: number) => Promise<ParentCloseChoice>;
  detach: (parentId: string, childIds: string[]) => Promise<void>;
  closeChild: (id: string) => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  selectTab: (id: string) => void;
  selectAfterClose: (closedId: string, formerMemberIds: readonly string[]) => void;
  markPersistenceEligible: (projectId: string) => void;
  reportError: (message: string, error: unknown) => void;
}) {
  const suppressPresentation = ref(false);

  async function close(id: string): Promise<void> {
    const parent = options.tabs.find((tab) => tab.id === id);
    if (!parent) return;
    const family = terminalFamilyForTab(options.tabs, id);
    const shouldReplaceMain = options.mainTerminalId.value === id || family?.rootTabId === id;
    const remainingIds = family?.memberTabIds.filter((memberId) => memberId !== id) ?? [];
    if (parent.launch.kind === "shell") options.markPersistenceEligible(parent.projectId);

    const activeChildren = activeDirectSubagentTabs(options.tabs, id);
    const choice = activeChildren.length ? await options.ask(activeChildren.length) : undefined;
    const plan = parentClosePlan(options.tabs, id, choice);
    if (plan.action === "cancel") return;

    if (plan.action === "close") {
      suppressPresentation.value = true;
      try {
        await Promise.all(plan.childTabIds.map(options.closeChild));
      } finally {
        suppressPresentation.value = false;
      }
    } else {
      const children = options.tabs.filter(
        (tab) =>
          plan.childTabIds.includes(tab.id) &&
          tab.launch.kind === "subagent" &&
          tab.launch.parentTerminalId === id,
      );
      try {
        await options.detach(
          id,
          children.map((tab) => (tab.launch.kind === "subagent" ? tab.launch.subagentId : "")),
        );
      } catch (error) {
        options.reportError("Could not detach subagents", error);
        return;
      }
      for (const child of children) {
        if (child.launch.kind === "subagent") child.launch.parentTerminalId = undefined;
      }
    }

    suppressPresentation.value = true;
    try {
      await options.closeTerminal(id);
    } finally {
      suppressPresentation.value = false;
    }
    if (shouldReplaceMain) options.selectAfterClose(id, remainingIds);
    else if (
      options.activeTabId.value &&
      !remainingIds.includes(options.activeTabId.value) &&
      options.mainTerminalId.value
    ) {
      options.selectTab(options.mainTerminalId.value);
    }
  }

  return { close, suppressPresentation };
}
