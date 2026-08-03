import type { ProjectTerminal } from "../types/project";
import type { TerminalTabState } from "../types/terminal";
import { normalizeTerminalTitle } from "./terminalTitles";

export function normalizeProjectTerminals(
  terminals: readonly ProjectTerminal[] | undefined,
): ProjectTerminal[] | undefined {
  return terminals?.map((terminal) => {
    const customTitle = normalizeTerminalTitle(terminal.customTitle ?? "");
    return customTitle ? { customTitle } : {};
  });
}

export function projectTerminalsFromTabs(
  tabs: readonly TerminalTabState[],
  projectId: string,
): ProjectTerminal[] {
  return tabs
    .filter((tab) => tab.projectId === projectId && tab.launch.kind === "shell")
    .map((tab) => {
      const customTitle = normalizeTerminalTitle(tab.customTitle ?? "");
      return customTitle ? { customTitle } : {};
    });
}

export function projectTerminalsEqual(
  left: readonly ProjectTerminal[] | undefined,
  right: readonly ProjectTerminal[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((terminal, index) => terminal.customTitle === right[index]?.customTitle)
  );
}
