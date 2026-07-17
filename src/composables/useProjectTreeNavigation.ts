import { computed, onBeforeUnmount, onMounted, type Ref } from "vue";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalMatchesFilter } from "../utils/terminalLabels";

export type ProjectTreeNavigationAction =
  | { type: "focus"; selection: SidebarSelection }
  | { type: "activate"; selection: SidebarSelection }
  | { type: "toggle-terminals"; projectId: string }
  | { type: "toggle-commands"; projectId: string };

export function flattenProjectTree(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  filter = "",
): SidebarSelection[] {
  return projects.flatMap((project) => {
    const nodes: SidebarSelection[] = [projectSelection(project.id)];
    if (!(project.terminalOpen || project.commandsOpen)) return nodes;

    nodes.push({ id: `${project.id}:terminals`, kind: "terminals", projectId: project.id });
    if (project.terminalOpen) {
      nodes.push(
        ...tabs
          .filter((tab) => tab.projectId === project.id && terminalMatchesFilter(tab, filter))
          .map((tab) => ({
            id: tab.id,
            kind: "terminal" as const,
            projectId: project.id,
            tabId: tab.id,
          })),
      );
      nodes.push({
        id: `${project.id}:add-terminal`,
        kind: "add-terminal",
        projectId: project.id,
      });
    }

    nodes.push({ id: `${project.id}:commands`, kind: "commands", projectId: project.id });
    if (project.commandsOpen) {
      nodes.push({
        id: `${project.id}:add-command`,
        kind: "add-command",
        projectId: project.id,
      });
    }
    return nodes;
  });
}

export function projectTreeNavigationActions(
  key: string,
  nodes: readonly SidebarSelection[],
  selection: SidebarSelection,
  projects: readonly ProjectTreeProject[],
  sidebarHasFocus: boolean,
): ProjectTreeNavigationAction[] {
  if (!nodes.length) return [];

  const foundIndex = nodes.findIndex((node) => node.id === selection.id);
  const index = foundIndex < 0 ? 0 : foundIndex;
  const current = nodes[index];
  if (!current) return [];

  if (key === "ArrowUp" || key === "ArrowDown") {
    const offset = key === "ArrowDown" ? 1 : -1;
    const next = nodes[(index + offset + nodes.length) % nodes.length];
    return next ? [{ type: "focus", selection: next }] : [];
  }

  const project = projects.find((item) => item.id === current.projectId);
  if (!project) return [];

  if (key === "ArrowLeft") {
    if (current.kind === "terminal" && !sidebarHasFocus) {
      return [{ type: "focus", selection: current }];
    }
    if (current.kind === "project") {
      return [
        ...(project.terminalOpen
          ? [{ type: "toggle-terminals" as const, projectId: project.id }]
          : []),
        ...(project.commandsOpen
          ? [{ type: "toggle-commands" as const, projectId: project.id }]
          : []),
      ];
    }
    if (current.kind === "terminals" && project.terminalOpen) {
      return [{ type: "toggle-terminals", projectId: project.id }];
    }
    if (current.kind === "commands" && project.commandsOpen) {
      return [{ type: "toggle-commands", projectId: project.id }];
    }
    return [{ type: "focus", selection: projectSelection(project.id) }];
  }

  if (key === "ArrowRight") {
    if (current.kind === "project") {
      return [
        ...(!project.terminalOpen
          ? [{ type: "toggle-terminals" as const, projectId: project.id }]
          : []),
        ...(!project.commandsOpen
          ? [{ type: "toggle-commands" as const, projectId: project.id }]
          : []),
      ];
    }
    if (current.kind === "terminals" && !project.terminalOpen) {
      return [{ type: "toggle-terminals", projectId: project.id }];
    }
    if (current.kind === "commands" && !project.commandsOpen) {
      return [{ type: "toggle-commands", projectId: project.id }];
    }
    return [{ type: "activate", selection: current }];
  }

  return [];
}

export function useProjectTreeNavigation(options: {
  projects: Ref<ProjectTreeProject[]>;
  tabs: Ref<TerminalTabState[]>;
  filter: Ref<string>;
  selection: Ref<SidebarSelection>;
  sidebarElement: Ref<HTMLElement | undefined>;
  onAction: (action: ProjectTreeNavigationAction) => void;
}) {
  const tree = computed(() =>
    flattenProjectTree(options.projects.value, options.tabs.value, options.filter.value),
  );

  function onKeydown(event: KeyboardEvent): void {
    if (
      !event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const sidebarHasFocus = options.sidebarElement.value?.contains(document.activeElement) ?? false;
    for (const action of projectTreeNavigationActions(
      event.key,
      tree.value,
      options.selection.value,
      options.projects.value,
      sidebarHasFocus,
    )) {
      options.onAction(action);
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeydown, { capture: true }));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, { capture: true }));

  return { tree, onKeydown };
}

function projectSelection(projectId: string): SidebarSelection {
  return { id: projectId, kind: "project", projectId };
}
