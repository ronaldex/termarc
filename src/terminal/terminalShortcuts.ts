import { TERMINAL_FONT_SIZE_OPTIONS } from "../settings/options";
import { adjacentTabId } from "../utils/terminalTabs";

export type TerminalShortcutDependencies = {
  terminalFocused: boolean;
  tabIdsByNumber: ReadonlyMap<number, string>;
  orderedTabIds: readonly string[];
  activeTabId?: string;
  fontSize: number;
  shortcutModifier?: "meta" | "ctrl";
  selectTab: (id: string) => void;
  setFontSize: (size: number) => void;
};

export function handleTerminalShortcut(
  event: KeyboardEvent,
  dependencies: TerminalShortcutDependencies,
): boolean {
  const modifierPressed = dependencies.shortcutModifier === "ctrl" ? event.ctrlKey : event.metaKey;
  const otherModifierPressed =
    dependencies.shortcutModifier === "ctrl" ? event.metaKey : event.ctrlKey;
  const shortcut = modifierPressed || (event.ctrlKey && event.shiftKey);
  if (!shortcut) return false;

  if (
    dependencies.terminalFocused &&
    modifierPressed &&
    !event.shiftKey &&
    !event.altKey &&
    !otherModifierPressed &&
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    dependencies.orderedTabIds.length > 1
  ) {
    const nextId = adjacentTabId(
      dependencies.orderedTabIds,
      dependencies.activeTabId,
      event.key === "ArrowDown" ? 1 : -1,
    );
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

  return false;
}
