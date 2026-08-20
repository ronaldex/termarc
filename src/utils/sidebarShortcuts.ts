import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";

export type SidebarShortcutSelection =
  | Extract<SidebarSelection, { kind: "terminal" }>
  | { id: string; kind: "command" | "agent"; projectId: string; commandId: string };

export type NumberedSidebarShortcut = {
  number: number;
  selection: SidebarShortcutSelection;
};

export function numberedSidebarShortcuts(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
): NumberedSidebarShortcut[] {
  const selections = projects.flatMap((project) => {
    const terminals: NumberedSidebarShortcut["selection"][] = tabs
      .filter((tab) => tab.projectId === project.id && tab.launch.kind === "shell")
      .map((tab) => ({
        id: tab.id,
        kind: "terminal" as const,
        projectId: project.id,
        tabId: tab.id,
      }));
    const agents: NumberedSidebarShortcut["selection"][] = (project.agents ?? []).map((agent) => ({
      id: `${project.id}:agent:${agent.id}`,
      kind: "agent" as const,
      projectId: project.id,
      commandId: agent.id,
    }));
    const commands: NumberedSidebarShortcut["selection"][] = (project.commands ?? []).map(
      (command) => ({
        id: `${project.id}:command:${command.id}`,
        kind: "command" as const,
        projectId: project.id,
        commandId: command.id,
      }),
    );
    // Keep numbering aligned with the visible project-tree order: Agents,
    // then dynamic Terminals, then Commands.
    return [...agents, ...terminals, ...commands];
  });

  return selections.map((selection, index) => ({ number: index + 1, selection }));
}

export function sidebarShortcutKey(selection: SidebarShortcutSelection): string {
  return selection.kind === "terminal"
    ? `terminal:${selection.tabId}`
    : `${selection.kind}:${selection.projectId}:${selection.commandId}`;
}
