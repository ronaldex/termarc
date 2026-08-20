import { computed, ref, watch, type Ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";

export function useWorkspaceSelection(projects: Ref<Project[]>) {
  const selection = ref<SidebarSelection>({
    id: "home",
    kind: "project",
    projectId: "home",
  });
  const activeProjectId = computed(() =>
    "projectId" in selection.value ? selection.value.projectId : undefined,
  );
  const selectedProject = computed(() =>
    projects.value.find((project) => project.id === activeProjectId.value),
  );

  function focus(next: SidebarSelection): void {
    selection.value = next;
  }

  function selectProject(project: Project): void {
    focus({ id: project.id, kind: "project", projectId: project.id });
  }

  function selectTerminal(projectId: string, tabId: string): void {
    focus({ id: tabId, kind: "terminal", projectId, tabId });
  }

  function selectTerminalSection(projectId: string): void {
    focus({ id: `${projectId}:terminals`, kind: "terminals", projectId });
  }

  function selectAddTerminal(projectId: string): void {
    focus({ id: `${projectId}:add-terminal`, kind: "add-terminal", projectId });
  }

  function selectAgents(projectId: string): void {
    focus({ id: `${projectId}:agents`, kind: "agents", projectId });
  }

  function selectAddAgent(projectId: string): void {
    focus({ id: `${projectId}:add-agent`, kind: "add-agent", projectId });
  }

  function selectAgent(projectId: string, commandId: string): void {
    focus({ id: `${projectId}:agent:${commandId}`, kind: "agent", projectId, commandId });
  }

  function selectEditAgent(projectId: string, commandId: string): void {
    focus({
      id: `${projectId}:agent:${commandId}:settings`,
      kind: "edit-agent",
      projectId,
      commandId,
    });
  }

  function selectCommands(projectId: string): void {
    focus({ id: `${projectId}:commands`, kind: "commands", projectId });
  }

  function selectCommand(projectId: string, commandId: string): void {
    focus({ id: `${projectId}:command:${commandId}`, kind: "command", projectId, commandId });
  }

  function selectAddCommand(projectId: string): void {
    focus({ id: `${projectId}:add-command`, kind: "add-command", projectId });
  }

  function selectEditCommand(projectId: string, commandId: string): void {
    focus({
      id: `${projectId}:command:${commandId}:settings`,
      kind: "edit-command",
      projectId,
      commandId,
    });
  }

  function selectProjectManagement(projectId?: string): void {
    focus({ id: "projects", kind: "projects", projectId });
  }

  function openSettings(): void {
    focus({ id: "app-settings", kind: "app-settings" });
  }

  function openKeyboardShortcuts(): void {
    focus({ id: "keyboard-shortcuts", kind: "keyboard-shortcuts" });
  }

  watch(
    projects,
    (value) => {
      if (value.some((project) => project.id === activeProjectId.value)) return;
      const first = value[0];
      if (first) selectProject(first);
    },
    { deep: false },
  );

  return {
    selection,
    activeProjectId,
    selectedProject,
    focus,
    selectProject,
    selectTerminal,
    selectTerminalSection,
    selectAddTerminal,
    selectCommands,
    selectAgents,
    selectAgent,
    selectAddAgent,
    selectEditAgent,
    selectCommand,
    selectAddCommand,
    selectEditCommand,
    selectProjectManagement,
    openSettings,
    openKeyboardShortcuts,
  };
}
