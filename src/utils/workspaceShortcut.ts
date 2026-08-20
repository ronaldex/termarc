export type WorkspaceFocusRegion = "left-sidebar" | "workspace" | "right-sidebar" | "other";

export type WorkspaceShortcutAction =
  | { type: "cycle-terminal"; direction: -1 | 1 }
  | { type: "focus-left-sidebar" }
  | { type: "focus-workspace-from-left" }
  | { type: "focus-right-sidebar" }
  | { type: "focus-workspace-from-right" }
  | { type: "escape" }
  | { type: "open-settings" }
  | { type: "open-keyboard-shortcuts" }
  | { type: "focus-process-filter" }
  | { type: "focus-project"; number: number }
  | { type: "create-terminal" }
  | { type: "close-terminal" }
  | { type: "toggle-left-sidebar" }
  | { type: "toggle-right-sidebar" };

export type WorkspaceContentFocusTarget = "terminal" | "workspace";

export type WorkspaceShortcutInput = {
  key: string;
  code: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shortcutModifier?: "meta" | "ctrl";
  editableTarget: boolean;
  focusRegion: WorkspaceFocusRegion;
  /** A shell terminal or named agent is selected in the left sidebar. */
  terminalSelected: boolean;
  activeTerminalAvailable: boolean;
  gitSidebarAvailable: boolean;
};

export function workspaceContentFocusTarget(
  activeTerminalAvailable: boolean,
  terminalSelectionActive: boolean,
): WorkspaceContentFocusTarget {
  return activeTerminalAvailable && terminalSelectionActive ? "terminal" : "workspace";
}

export function workspaceShortcutAction(
  input: WorkspaceShortcutInput,
): WorkspaceShortcutAction | undefined {
  const modifierPressed = input.shortcutModifier === "ctrl" ? input.ctrlKey : input.metaKey;
  const otherModifierPressed = input.shortcutModifier === "ctrl" ? input.metaKey : input.ctrlKey;
  const commandModifier =
    modifierPressed && !input.shiftKey && !input.altKey && !otherModifierPressed;

  if (
    !input.editableTarget &&
    commandModifier &&
    (input.focusRegion === "left-sidebar" || input.focusRegion === "workspace") &&
    input.terminalSelected &&
    (input.key === "ArrowUp" || input.key === "ArrowDown")
  ) {
    return { type: "cycle-terminal", direction: input.key === "ArrowDown" ? 1 : -1 };
  }

  if (!input.editableTarget && commandModifier) {
    if (input.key === "ArrowLeft" && input.focusRegion === "workspace") {
      return { type: "focus-left-sidebar" };
    }
    if (input.key === "ArrowRight" && input.focusRegion === "left-sidebar") {
      return { type: "focus-workspace-from-left" };
    }
    if (
      input.key === "ArrowRight" &&
      input.focusRegion === "workspace" &&
      input.gitSidebarAvailable
    ) {
      return { type: "focus-right-sidebar" };
    }
    if (input.key === "ArrowLeft" && input.focusRegion === "right-sidebar") {
      return { type: "focus-workspace-from-right" };
    }
  }

  const projectShortcutNumber = /^[1-9]$/.test(input.key)
    ? Number(input.key)
    : /^Digit([1-9])$/.exec(input.code)?.[1];
  if (
    input.altKey &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.shiftKey &&
    projectShortcutNumber
  ) {
    return { type: "focus-project", number: Number(projectShortcutNumber) };
  }

  if (input.key === "Escape") return { type: "escape" };
  if (modifierPressed && input.key === ",") return { type: "open-settings" };
  if (
    modifierPressed &&
    !input.shiftKey &&
    !input.altKey &&
    !otherModifierPressed &&
    (input.key === "/" || input.code === "Slash")
  ) {
    return { type: "open-keyboard-shortcuts" };
  }
  if (
    modifierPressed &&
    input.shiftKey &&
    !input.altKey &&
    !otherModifierPressed &&
    (input.key.toLowerCase() === "f" || input.code === "KeyF")
  ) {
    return { type: "focus-process-filter" };
  }
  if (modifierPressed && (input.key.toLowerCase() === "t" || input.code === "KeyT")) {
    return { type: "create-terminal" };
  }
  if (
    modifierPressed &&
    input.activeTerminalAvailable &&
    (input.key.toLowerCase() === "w" || input.code === "KeyW")
  ) {
    return { type: "close-terminal" };
  }
  if (
    modifierPressed &&
    !input.shiftKey &&
    !input.altKey &&
    !otherModifierPressed &&
    (input.key.toLowerCase() === "p" || input.code === "KeyP")
  ) {
    return { type: "toggle-left-sidebar" };
  }
  if (modifierPressed && input.key.toLowerCase() === "d" && input.gitSidebarAvailable) {
    return { type: "toggle-right-sidebar" };
  }
}
