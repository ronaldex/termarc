import type { ProjectTerminal } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { normalizeTerminalOrdering } from "./terminalOrdering";
import { normalizeTerminalTitle } from "./terminalTitles";

export function createTerminalId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function normalizeProjectTerminals(
  terminals: readonly ProjectTerminal[] | undefined,
  createId: () => string = createTerminalId,
  usedIds?: Set<string>,
): ProjectTerminal[] | undefined {
  const cleaned = terminals?.map((terminal) => {
    const customTitle = normalizeTerminalTitle(terminal.customTitle ?? "");
    return customTitle ? { id: terminal.id, customTitle } : { id: terminal.id };
  });
  return normalizeTerminalOrdering(cleaned, createId, usedIds).terminals;
}

export function projectTerminalsFromTabs(
  tabs: readonly TerminalTabState[],
  projectId: string,
): ProjectTerminal[] {
  return tabs
    .filter((tab) => tab.projectId === projectId && tab.launch.kind === "shell")
    .map((tab) => {
      const customTitle = normalizeTerminalTitle(tab.customTitle ?? "");
      return customTitle ? { id: tab.id, customTitle } : { id: tab.id };
    });
}

export function projectTerminalsEqual(
  left: readonly ProjectTerminal[] | undefined,
  right: readonly ProjectTerminal[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every(
      (terminal, index) =>
        terminal.id === right[index]?.id && terminal.customTitle === right[index]?.customTitle,
    )
  );
}
