import type { TerminalTabState } from "../types/terminal";
import { terminalFamilyForTab } from "./terminalFamily";

export type TerminalCloseChoice = "close" | "cancel";

export type TerminalClosePlan = {
  tabIds: string[];
  childCount: number;
  runningProcessCount: number;
};

/**
 * A family root owns its subterminals, so closing it closes the complete family.
 * Closing a subterminal only closes that terminal.
 */
export function terminalClosePlan(
  tabs: readonly TerminalTabState[],
  terminalId: string,
): TerminalClosePlan {
  const family = terminalFamilyForTab(tabs, terminalId);
  const tabIds = family?.rootTabId === terminalId ? [...family.memberTabIds] : [terminalId];
  const closingTabs = tabs.filter((tab) => tabIds.includes(tab.id));

  return {
    tabIds,
    childCount: Math.max(0, tabIds.length - 1),
    runningProcessCount: closingTabs.filter((tab) => Boolean(tab.processName)).length,
  };
}
