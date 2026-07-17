import { computed, ref, watch, type Ref } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";

export function useWorkspaceSelection(projects: Ref<Project[]>) {
  const selection = ref<SidebarSelection>({
    id: "project-1",
    kind: "project",
    projectId: "project-1",
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

  function openSettings(): void {
    focus({ id: "app-settings", kind: "app-settings" });
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
    openSettings,
  };
}
