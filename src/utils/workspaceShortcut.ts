export type WorkspaceFocusRegion = "left-sidebar" | "workspace" | "right-sidebar" | "other";

export type WorkspaceShortcutAction =
  | { type: "cycle-terminal"; direction: -1 | 1 }
  | { type: "focus-left-sidebar" }
  | { type: "focus-workspace-from-left" }
  | { type: "focus-right-sidebar" }
  | { type: "focus-workspace-from-right" }
  | { type: "escape" }
  | { type: "open-settings" }
  | { type: "toggle-right-sidebar" };

export type WorkspaceShortcutInput = {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  editableTarget: boolean;
  focusRegion: WorkspaceFocusRegion;
  terminalSelected: boolean;
  gitSidebarAvailable: boolean;
};

export function workspaceShortcutAction(
  input: WorkspaceShortcutInput,
): WorkspaceShortcutAction | undefined {
  const commandArrow = input.metaKey && !input.shiftKey && !input.altKey && !input.ctrlKey;

  if (
    !input.editableTarget &&
    commandArrow &&
    input.focusRegion === "left-sidebar" &&
    input.terminalSelected &&
    (input.key === "ArrowUp" || input.key === "ArrowDown")
  ) {
    return { type: "cycle-terminal", direction: input.key === "ArrowDown" ? 1 : -1 };
  }

  if (!input.editableTarget && commandArrow) {
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

  if (input.key === "Escape") return { type: "escape" };
  if (input.metaKey && input.key === ",") return { type: "open-settings" };
  if (input.metaKey && input.key.toLowerCase() === "d" && input.gitSidebarAvailable) {
    return { type: "toggle-right-sidebar" };
  }
}
