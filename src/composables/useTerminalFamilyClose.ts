import { ref, type Ref } from "vue";
import type { TerminalTab } from "../types/terminal";
import {
  terminalClosePlan,
  type TerminalCloseChoice,
  type TerminalClosePlan,
} from "../utils/parentClose";
import { terminalFamilyForTab } from "../utils/terminalFamily";

export function useTerminalFamilyClose(options: {
  tabs: TerminalTab[];
  activeTabId: Ref<string | undefined>;
  mainTerminalId: Ref<string | undefined>;
  ask: (plan: TerminalClosePlan) => Promise<TerminalCloseChoice>;
  closeChild: (id: string) => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  selectTab: (id: string) => void;
  selectAfterClose: (closedId: string, formerMemberIds: readonly string[]) => void;
  markPersistenceEligible: (projectId: string) => void;
}) {
  const suppressPresentation = ref(false);

  async function close(id: string): Promise<void> {
    const terminal = options.tabs.find((tab) => tab.id === id);
    if (!terminal) return;
    const family = terminalFamilyForTab(options.tabs, id);
    const shouldReplaceMain = options.mainTerminalId.value === id || family?.rootTabId === id;
    const plan = terminalClosePlan(options.tabs, id);
    const childIds = plan.tabIds.filter((tabId) => tabId !== id);
    const remainingIds = family?.memberTabIds.filter((tabId) => !plan.tabIds.includes(tabId)) ?? [];
    if (terminal.launch.kind === "shell") options.markPersistenceEligible(terminal.projectId);

    if (plan.runningProcessCount > 0 && (await options.ask(plan)) !== "close") return;

    suppressPresentation.value = true;
    try {
      await Promise.all(childIds.map(options.closeChild));
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
