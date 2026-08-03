import type { TerminalTabState } from "../types/terminal";

export function normalizeTerminalTitle(title: string): string | undefined {
  return title.trim() || undefined;
}

/** Updates only the user-controlled layer of a terminal title. */
export function updateTerminalTitleOverride(
  tab: Pick<TerminalTabState, "customTitle">,
  title: string,
): void {
  tab.customTitle = normalizeTerminalTitle(title);
}
