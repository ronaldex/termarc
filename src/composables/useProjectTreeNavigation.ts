import { computed, onBeforeUnmount, onMounted, type Ref } from "vue";
import type { ProjectTreeProject } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { isEditableTarget } from "../utils/dom";
import { projectRailSelections } from "../utils/sidebarSummary";
import { terminalMatchesFilter } from "../utils/terminalLabels";

export type ProjectTreeNavigationAction =
  | { type: "focus"; selection: SidebarSelection }
  | { type: "activate"; selection: SidebarSelection }
  | { type: "toggle-project"; projectId: string }
  | { type: "toggle-terminals"; projectId: string }
  | { type: "toggle-commands"; projectId: string };

export function flattenProjectTree(
  projects: readonly ProjectTreeProject[],
  tabs: readonly TerminalTabState[],
  filter = "",
): SidebarSelection[] {
  return projects.flatMap((project) => {
    const nodes: SidebarSelection[] = [projectSelection(project.id)];
    if (!project.projectOpen) return nodes;

    nodes.push({ id: `${project.id}:terminals`, kind: "terminals", projectId: project.id });
    if (project.terminalOpen) {
      nodes.push(
        ...tabs
          .filter(
            (tab) =>
              tab.launch.kind === "shell" &&
              tab.projectId === project.id &&
              terminalMatchesFilter(tab, filter),
          )
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

    if (project.commands?.length) {
      nodes.push({ id: `${project.id}:commands`, kind: "commands", projectId: project.id });
    }
    if (project.commandsOpen && project.commands?.length) {
      nodes.push(
        ...project.commands.map((command) => ({
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

export function projectTreeNavigationActions(
  key: string,
  nodes: readonly SidebarSelection[],
  selection: SidebarSelection,
  projects: readonly ProjectTreeProject[],
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

  if (key === "Enter") return [{ type: "activate", selection: current }];

  if (!("projectId" in current)) return [];
  const project = projects.find((item) => item.id === current.projectId);
  if (!project) return [];

  if (key === "ArrowLeft") {
    if (current.kind === "project") {
      return project.projectOpen ? [{ type: "toggle-project", projectId: project.id }] : [];
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
      return !project.projectOpen ? [{ type: "toggle-project", projectId: project.id }] : [];
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
  collapsed: Ref<boolean | undefined>;
  selection: Ref<SidebarSelection>;
  sidebarElement: Ref<HTMLElement | undefined>;
  onAction: (action: ProjectTreeNavigationAction) => void;
}) {
  const tree = computed(() =>
    options.collapsed.value
      ? projectRailSelections(options.projects.value, options.tabs.value)
      : flattenProjectTree(options.projects.value, options.tabs.value, options.filter.value),
  );

  function onKeydown(event: KeyboardEvent): void {
    const sidebarHasFocus = options.sidebarElement.value?.contains(document.activeElement) ?? false;
    if (
      !sidebarHasFocus ||
      isEditableTarget(event.target) ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const actions = options.collapsed.value
      ? railNavigationActions(event.key, tree.value, options.selection.value)
      : projectTreeNavigationActions(
          event.key,
          tree.value,
          options.selection.value,
          options.projects.value,
        );
    for (const action of actions) {
      options.onAction(action);
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeydown, { capture: true }));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, { capture: true }));

  return { tree, onKeydown };
}

export function railNavigationActions(
  key: string,
  nodes: readonly SidebarSelection[],
  selection: SidebarSelection,
): ProjectTreeNavigationAction[] {
  if (!nodes.length) return [];
  const foundIndex = nodes.findIndex((node) => node.id === selection.id);
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (foundIndex < 0) {
      const boundary = key === "ArrowDown" ? nodes[0] : nodes.at(-1);
      return boundary ? [{ type: "focus", selection: boundary }] : [];
    }
    const offset = key === "ArrowDown" ? 1 : -1;
    const next = nodes[(foundIndex + offset + nodes.length) % nodes.length];
    return next ? [{ type: "focus", selection: next }] : [];
  }

  const current = nodes[foundIndex < 0 ? 0 : foundIndex];
  if ((key === "Enter" || key === "ArrowRight") && current) {
    return [{ type: "activate", selection: current }];
  }
  return [];
}

function projectSelection(projectId: string): SidebarSelection {
  return { id: projectId, kind: "project", projectId };
}
