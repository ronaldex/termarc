import type { ProjectTerminal } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { normalizeTerminalTitle } from "./terminalTitles";

export function createTerminalId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function normalizeProjectTerminals(
  terminals: readonly ProjectTerminal[] | undefined,
): ProjectTerminal[] | undefined {
  if (!terminals) return undefined;
  const byId = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const normalized = terminals.map((terminal) => {
    const customTitle = normalizeTerminalTitle(terminal.customTitle ?? "");
    const parent = terminal.parentTerminalId ? byId.get(terminal.parentTerminalId) : undefined;
    const parentTerminalId =
      parent && parent.id !== terminal.id && !parent.parentTerminalId ? parent.id : undefined;
    const cwd = terminal.cwd?.trim();
    return {
      id: terminal.id,
      ...(customTitle ? { customTitle } : {}),
      ...(cwd ? { cwd } : {}),
      ...(parentTerminalId ? { parentTerminalId } : {}),
    };
  });
  return normalized
    .filter((terminal) => !terminal.parentTerminalId)
    .flatMap((root) => [
      root,
      ...normalized.filter((terminal) => terminal.parentTerminalId === root.id),
    ]);
}

export function projectTerminalsFromTabs(
  tabs: readonly TerminalTabState[],
  projectId: string,
): ProjectTerminal[] {
  return (
    normalizeProjectTerminals(
      tabs
        .filter((tab) => tab.projectId === projectId && tab.launch.kind === "shell")
        .map((tab) => {
          const customTitle = normalizeTerminalTitle(tab.customTitle ?? "");
          const cwd = (tab.currentCwd ?? tab.cwd).trim();
          return {
            id: tab.id,
            ...(customTitle ? { customTitle } : {}),
            ...(cwd ? { cwd } : {}),
            ...(tab.parentTerminalId ? { parentTerminalId: tab.parentTerminalId } : {}),
          };
        }),
    ) ?? []
  );
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
        terminal.id === right[index]?.id &&
        terminal.customTitle === right[index]?.customTitle &&
        terminal.cwd === right[index]?.cwd &&
        terminal.parentTerminalId === right[index]?.parentTerminalId,
    )
  );
}
