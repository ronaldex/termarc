import type { TerminalTabState } from "../types/terminal";

export type ParentCloseChoice = "stop" | "detach" | "cancel";

export type ParentClosePlan =
  | { action: "cancel"; childTabIds: string[] }
  | { action: "close"; childTabIds: string[] }
  | { action: "detach"; childTabIds: string[] };

export function directSubagentTabs(
  tabs: readonly TerminalTabState[],
  parentTerminalId: string,
): TerminalTabState[] {
  return tabs.filter(
    (tab) => tab.launch.kind === "subagent" && tab.launch.parentTerminalId === parentTerminalId,
  );
}

export function activeDirectSubagentTabs(
  tabs: readonly TerminalTabState[],
  parentTerminalId: string,
): TerminalTabState[] {
  return directSubagentTabs(tabs, parentTerminalId).filter(
    (tab) => tab.status === "starting" || tab.status === "running",
  );
}

/** Completed children do not prompt, but are detached so their runtime output remains visible. */
export function parentClosePlan(
  tabs: readonly TerminalTabState[],
  parentTerminalId: string,
  choice?: ParentCloseChoice,
): ParentClosePlan {
  const children = directSubagentTabs(tabs, parentTerminalId);
  const childTabIds = children.map((tab) => tab.id);
  const hasActiveChildren = children.some(
    (tab) => tab.status === "starting" || tab.status === "running",
  );

  if (!hasActiveChildren) {
    return childTabIds.length
      ? { action: "detach", childTabIds }
      : { action: "close", childTabIds };
  }
  if (!choice || choice === "cancel") return { action: "cancel", childTabIds };
  return { action: choice === "stop" ? "close" : "detach", childTabIds };
}
