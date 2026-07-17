import type { TerminalTabState } from "../types/terminal";

export type TerminalDisplayModel = {
  primaryLabel: string;
  secondaryLabel?: string;
  tooltip: string;
  busy: boolean;
  running: boolean;
  primaryIsPath: boolean;
  secondaryIsPath: boolean;
};

export function terminalDisplayModel(tab: TerminalTabState): TerminalDisplayModel {
  const activityLabel = tab.agent === "pi" ? "Pi" : tab.processName || tab.currentCwd || tab.cwd;
  const hasNamedLabel = Boolean(tab.name || tab.terminalTitle);

  return {
    primaryLabel: tab.name || tab.terminalTitle || activityLabel,
    secondaryLabel: hasNamedLabel ? activityLabel : undefined,
    tooltip: activityLabel,
    busy: tab.agentState === "processing",
    running: Boolean(tab.processName),
    primaryIsPath: !tab.name && !tab.terminalTitle && !tab.processName,
    secondaryIsPath: !tab.processName && !tab.agent,
  };
}

export function terminalMatchesFilter(tab: TerminalTabState, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [tab.name, tab.terminalTitle, tab.processName, tab.currentCwd, tab.cwd, tab.title].some(
    (value) => value?.toLowerCase().includes(normalized),
  );
}
