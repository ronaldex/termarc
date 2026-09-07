import type { RightSidebarMode } from "../types/rightSidebar";
import type { WorkspaceFocusRegion } from "./workspaceShortcut";
import type { SidebarSelection } from "../types/sidebar";

export type WorkspaceShortcutHint = {
  label: string;
  keys: string;
};

export function workspaceShortcutHints(input: {
  focusRegion: WorkspaceFocusRegion;
  selection: SidebarSelection;
  terminalFocused: boolean;
  rightSidebarAvailable: boolean;
  rightSidebarMode?: RightSidebarMode;
  rightSidebarHasPreviousMode?: boolean;
  rightSidebarHasNextMode?: boolean;
}): WorkspaceShortcutHint[] {
  const terminalSelected =
    input.selection.kind === "terminal" ||
    input.selection.kind === "agent" ||
    input.selection.kind === "subagent";

  if (input.focusRegion === "left-sidebar") {
    return [
      { label: "Navigate", keys: "↑ ↓" },
      { label: "Open", keys: "Enter" },
      { label: "Focus workspace", keys: "⌘ →" },
      { label: "Filter", keys: "⌘ ⇧ F" },
    ];
  }

  if (input.focusRegion === "right-sidebar") {
    return [
      ...(input.rightSidebarMode === "subterminals" && input.terminalFocused
        ? [
            { label: "Cycle terminals", keys: "⌘ ↑ ↓" },
            { label: "Include main", keys: "⌘ ⇧ ↑ ↓" },
          ]
        : []),
      ...(input.rightSidebarHasPreviousMode
        ? [{ label: "Previous view", keys: "⌘ ←" }]
        : [{ label: "Focus workspace", keys: "⌘ ←" }]),
      ...(input.rightSidebarHasNextMode ? [{ label: "Next view", keys: "⌘ →" }] : []),
      { label: "Close panel", keys: "Esc" },
    ];
  }

  if (input.focusRegion === "workspace" && input.terminalFocused) {
    return [
      ...(terminalSelected
        ? [
            { label: "Cycle terminals", keys: "⌘ ↑ ↓" },
            { label: "Include children", keys: "⌘ ⇧ ↑ ↓" },
          ]
        : []),
      { label: "Switch terminal", keys: "⌘ 1–9" },
      { label: "Font size", keys: "⌘ + −" },
      ...(input.rightSidebarAvailable ? [{ label: "Focus panel", keys: "⌘ →" }] : []),
    ];
  }

  if (input.focusRegion === "workspace") {
    return [
      { label: "Focus sidebar", keys: "⌘ ←" },
      ...(input.rightSidebarAvailable ? [{ label: "Focus panel", keys: "⌘ →" }] : []),
      { label: "New terminal", keys: "⌘ T" },
      { label: "Shortcuts", keys: "⌘ /" },
    ];
  }

  return [
    { label: "Shortcuts", keys: "⌘ /" },
    { label: "Settings", keys: "⌘ ," },
    { label: "Toggle sidebar", keys: "⌘ S" },
  ];
}
