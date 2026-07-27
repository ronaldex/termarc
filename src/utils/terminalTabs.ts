import type { ProjectTreeProject } from "../types/project";
import type { TerminalTabState } from "../types/terminal";

export function terminalShortcutOrder(
  tabs: readonly TerminalTabState[],
  projects: readonly ProjectTreeProject[],
): string[] {
  const orderedIds = projects.flatMap((project) => [
    ...tabs
      .filter((tab) => tab.projectId === project.id && tab.launch.kind === "shell")
      .map((tab) => tab.id),
    ...(project.commands ?? []).flatMap((command) =>
      tabs
        .filter(
          (tab) =>
            tab.projectId === project.id &&
            tab.launch.kind === "command" &&
            tab.launch.commandId === command.id,
        )
        .map((tab) => tab.id),
    ),
  ]);
  const includedIds = new Set(orderedIds);
  return [...orderedIds, ...tabs.filter((tab) => !includedIds.has(tab.id)).map((tab) => tab.id)];
}

export function projectTerminalIds(
  tabs: readonly TerminalTabState[],
  projectId: string | undefined,
): string[] {
  if (!projectId) return [];
  return tabs
    .filter((tab) => tab.projectId === projectId && tab.launch.kind === "shell")
    .map((tab) => tab.id);
}

export function adjacentTabId(
  orderedTabIds: readonly string[],
  activeTabId: string | undefined,
  direction: -1 | 1,
): string | undefined {
  if (orderedTabIds.length < 2) return;

  const currentIndex = orderedTabIds.indexOf(activeTabId ?? "");
  const startIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
  const nextIndex = (startIndex + direction + orderedTabIds.length) % orderedTabIds.length;
  return orderedTabIds[nextIndex];
}

export function nextProjectTerminalId(
  tabs: readonly TerminalTabState[],
  closingId: string,
): string | undefined {
  const closingIndex = tabs.findIndex((tab) => tab.id === closingId);
  const closingTab = tabs[closingIndex];
  if (!closingTab || closingTab.launch.kind !== "shell") return;

  const isSiblingTerminal = (tab: TerminalTabState): boolean =>
    tab.id !== closingId && tab.projectId === closingTab.projectId && tab.launch.kind === "shell";

  return (
    tabs.slice(closingIndex + 1).find(isSiblingTerminal)?.id ??
    tabs.slice(0, closingIndex).reverse().find(isSiblingTerminal)?.id
  );
}
