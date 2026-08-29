import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { flattenProjectTreeModel, projectTreeModel } from "./projectTreeModel";

export type SidebarShortcutSelection =
  | Extract<SidebarSelection, { kind: "terminal" | "subagent" }>
  | { id: string; kind: "command" | "agent"; projectId: string; commandId: string };

export type NumberedSidebarShortcut = {
  number: number;
  selection: SidebarShortcutSelection;
};

export function numberedSidebarShortcuts(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  filter = "",
): NumberedSidebarShortcut[] {
  const shortcutProjects = projects.map((project) => ({
    ...project,
    projectOpen: true,
    agentsOpen: true,
    terminalOpen: true,
    commandsOpen: true,
  }));
  const selections = flattenProjectTreeModel(
    projectTreeModel(shortcutProjects, tabs, filter),
  ).filter(
    (selection): selection is SidebarShortcutSelection =>
      selection.kind === "agent" ||
      selection.kind === "subagent" ||
      selection.kind === "terminal" ||
      selection.kind === "command",
  );

  return selections.map((selection, index) => ({ number: index + 1, selection }));
}

export function sidebarShortcutKey(selection: SidebarShortcutSelection): string {
  return selection.kind === "terminal" || selection.kind === "subagent"
    ? `${selection.kind}:${selection.tabId}`
    : `${selection.kind}:${selection.projectId}:${selection.commandId}`;
}
