import { TERMINAL_FONT_SIZE_OPTIONS } from "../settings/options";

export type TerminalShortcutDependencies = {
  terminalFocused: boolean;
  tabIdsByNumber: ReadonlyMap<number, string>;
  orderedTabIds: readonly string[];
  activeTabId?: string;
  fontSize: number;
  selectTab: (id: string) => void;
  setFontSize: (size: number) => void;
  createTab: () => void;
  closeActiveTab: () => void;
};

export function handleTerminalShortcut(
  event: KeyboardEvent,
  dependencies: TerminalShortcutDependencies,
): boolean {
  const shortcut = event.metaKey || (event.ctrlKey && event.shiftKey);
  if (!shortcut) return false;

  if (
    dependencies.terminalFocused &&
    event.metaKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    dependencies.orderedTabIds.length > 1
  ) {
    const currentIndex = dependencies.orderedTabIds.indexOf(dependencies.activeTabId ?? "");
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const startIndex = currentIndex >= 0 ? currentIndex : offset > 0 ? -1 : 0;
    const nextIndex =
      (startIndex + offset + dependencies.orderedTabIds.length) % dependencies.orderedTabIds.length;
    const nextId = dependencies.orderedTabIds[nextIndex];
    if (nextId) dependencies.selectTab(nextId);
    return true;
  }

  if (/^[1-9]$/.test(event.key)) {
    const tabId = dependencies.tabIdsByNumber.get(Number(event.key));
    if (tabId) dependencies.selectTab(tabId);
    return Boolean(tabId);
  }

  if (event.key === "=") {
    dependencies.setFontSize(
      TERMINAL_FONT_SIZE_OPTIONS.find((size) => size > dependencies.fontSize) ??
        TERMINAL_FONT_SIZE_OPTIONS.at(-1)!,
    );
    return true;
  }

  if (event.key === "-") {
    dependencies.setFontSize(
      [...TERMINAL_FONT_SIZE_OPTIONS].reverse().find((size) => size < dependencies.fontSize) ??
        TERMINAL_FONT_SIZE_OPTIONS[0],
    );
    return true;
  }

  if (event.key.toLowerCase() === "t") {
    dependencies.createTab();
    return true;
  }

  if (event.key.toLowerCase() === "w" && dependencies.activeTabId) {
    dependencies.closeActiveTab();
    return true;
  }

  return false;
}
