import type { ProjectCommand, ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalMatchesFilter } from "./terminalLabels";

export type ProjectTreeCommandItem = {
  command: ProjectCommand;
  tab?: TerminalTabState;
};

export type ProjectTreeDisplayProject = ProjectTreeProject & {
  terminalTabs: TerminalTabState[];
  hasTerminals: boolean;
  commandItems: ProjectTreeCommandItem[];
  agentItems: ProjectTreeCommandItem[];
};

export function projectTreeModel(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  filter = "",
): ProjectTreeDisplayProject[] {
  const shellTabsByProject = new Map<string, TerminalTabState[]>();
  const commandTabsByKey = new Map<string, TerminalTabState>();

  for (const tab of tabs) {
    if (tab.launch.kind === "shell") {
      const projectTabs = shellTabsByProject.get(tab.projectId) ?? [];
      projectTabs.push(tab);
      shellTabsByProject.set(tab.projectId, projectTabs);
    } else {
      commandTabsByKey.set(
        commandKey(tab.projectId, tab.launch.commandId, tab.launch.source ?? "command"),
        tab,
      );
    }
  }

  return projects.map((project) => {
    const projectTabs = shellTabsByProject.get(project.id) ?? [];
    return {
      ...project,
      terminalTabs: projectTabs.filter((tab) => terminalMatchesFilter(tab, filter)),
      hasTerminals: projectTabs.length > 0,
      commandItems: (project.commands ?? []).map((command) => ({
        command,
        tab: commandTabsByKey.get(commandKey(project.id, command.id, "command")),
      })),
      agentItems: (project.agents ?? []).map((agent) => ({
        command: agent,
        tab: commandTabsByKey.get(commandKey(project.id, agent.id, "agent")),
      })),
    };
  });
}

export function flattenProjectTreeModel(
  projects: readonly ProjectTreeDisplayProject[],
): SidebarSelection[] {
  return projects.flatMap((project) => {
    const nodes: SidebarSelection[] = [projectSelection(project.id)];
    if (!project.projectOpen) return nodes;

    if (project.agentItems.length) {
      nodes.push({ id: `${project.id}:agents`, kind: "agents", projectId: project.id });
    }
    if (project.agentsOpen) {
      nodes.push(
        ...project.agentItems.map(({ command }) => ({
          id: `${project.id}:agent:${command.id}`,
          kind: "agent" as const,
          projectId: project.id,
          commandId: command.id,
        })),
      );
    }

    nodes.push({ id: `${project.id}:terminals`, kind: "terminals", projectId: project.id });
    if (project.terminalOpen) {
      nodes.push(
        ...project.terminalTabs.map((tab) => ({
          id: tab.id,
          kind: "terminal" as const,
          projectId: project.id,
          tabId: tab.id,
        })),
      );
      if (!project.hasTerminals) {
        nodes.push({
          id: `${project.id}:add-terminal`,
          kind: "add-terminal",
          projectId: project.id,
        });
      }
    }

    if (project.commandItems.length) {
      nodes.push({ id: `${project.id}:commands`, kind: "commands", projectId: project.id });
    }
    if (project.commandsOpen) {
      nodes.push(
        ...project.commandItems.map(({ command }) => ({
          id: `${project.id}:command:${command.id}`,
          kind: "command" as const,
          projectId: project.id,
          commandId: command.id,
        })),
      );
    }
    return nodes;
  });
}

function commandKey(projectId: string, commandId: string, source: "command" | "agent"): string {
  return `${projectId}\0${source}\0${commandId}`;
}

function projectSelection(projectId: string): SidebarSelection {
  return { id: projectId, kind: "project", projectId };
}
