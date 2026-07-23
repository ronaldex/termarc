import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalStatus, TerminalTabState } from "../types/terminal";
import { terminalDisplayModel } from "./terminalLabels";

export type TerminalRailSummary = {
  id: string;
  label: string;
  number: number;
  status: TerminalStatus;
  busy: boolean;
  running: boolean;
  selected: boolean;
  command: boolean;
  selection: SidebarSelection;
};

export type ProjectRailSummary = {
  id: string;
  name: string;
  selected: boolean;
  tabs: TerminalRailSummary[];
  selection: SidebarSelection;
};

export function projectInitials(name: string): string {
  return (
    name
      .split(/[\s-_]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "•"
  );
}

function projectSelection(projectId: string): SidebarSelection {
  return { id: projectId, kind: "project", projectId };
}

function tabSelection(tab: TerminalTabState): SidebarSelection {
  return tab.launch.kind === "command"
    ? {
        id: `${tab.projectId}:command:${tab.launch.commandId}`,
        kind: "command",
        projectId: tab.projectId,
        commandId: tab.launch.commandId,
      }
    : { id: tab.id, kind: "terminal", projectId: tab.projectId, tabId: tab.id };
}

export function projectRailSelections(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
): SidebarSelection[] {
  return projects.flatMap((project) => [
    projectSelection(project.id),
    ...tabs
      .filter((tab) => tab.projectId === project.id)
      .sort((left, right) => left.number - right.number)
      .map(tabSelection),
  ]);
}

export function projectRailSummaries(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  selection: SidebarSelection,
): ProjectRailSummary[] {
  const selectedProjectId = "projectId" in selection ? selection.projectId : undefined;

  return projects.map((project) => {
    const projectTabs = tabs
      .filter((tab) => tab.projectId === project.id)
      .sort((left, right) => left.number - right.number)
      .map((tab): TerminalRailSummary => {
        const display = terminalDisplayModel(tab);
        const selectionModel = tabSelection(tab);

        return {
          id: tab.id,
          label: display.primaryLabel,
          number: tab.number,
          status: tab.status,
          busy: display.busy,
          running: display.running,
          selected: selection.id === selectionModel.id,
          command: tab.launch.kind === "command",
          selection: selectionModel,
        };
      });
    return {
      id: project.id,
      name: project.name,
      selected: project.id === selectedProjectId,
      tabs: projectTabs,
      selection: projectSelection(project.id),
    };
  });
}
