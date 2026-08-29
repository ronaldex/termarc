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
  const hasNamedLabel = Boolean(tab.customTitle || tab.launchTitle || tab.terminalTitle);

  return {
    primaryLabel: tab.customTitle || tab.launchTitle || tab.terminalTitle || activityLabel,
    secondaryLabel: hasNamedLabel ? activityLabel : undefined,
    tooltip: activityLabel,
    busy: tab.agentState === "processing",
    running: Boolean(tab.processName),
    primaryIsPath: !tab.customTitle && !tab.launchTitle && !tab.terminalTitle && !tab.processName,
    secondaryIsPath: !tab.processName && !tab.agent,
  };
}

export function terminalMatchesFilter(tab: TerminalTabState, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    tab.customTitle,
    tab.launchTitle,
    tab.terminalTitle,
    tab.processName,
    tab.currentCwd,
    tab.cwd,
    tab.title,
    tab.launch.kind === "subagent" ? tab.launch.name : undefined,
    tab.launch.kind === "subagent" ? tab.launch.processKind : undefined,
    tab.launch.kind === "subagent" ? tab.launch.commandLine : undefined,
  ].some((value) => value?.toLowerCase().includes(normalized));
}
