import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { loadProjects, saveProjects } from "../api/projects";
import type { Project, ProjectTreeProject, ProjectTreeState } from "../types/project";

const DEFAULT_PROJECT: Project = {
  id: "project-1",
  name: "Current project",
  directory: ".",
  commands: [],
};

function createProjectTreeState(overrides: Partial<ProjectTreeState> = {}): ProjectTreeState {
  return { projectOpen: true, terminalOpen: true, commandsOpen: true, ...overrides };
}

export function useProjects() {
  const projects = ref<Project[]>([{ ...DEFAULT_PROJECT }]);
  // Tree expansion is session-only UI state. Legacy fields are imported once during load.
  const treeState = reactive<Record<string, ProjectTreeState>>({
    [DEFAULT_PROJECT.id]: createProjectTreeState(),
  });
  const treeProjects = computed<ProjectTreeProject[]>(() =>
    projects.value.map((project) => ({ ...project, ...stateFor(project.id) })),
  );
  const loaded = ref(false);
  let saveTimer: number | undefined;

  async function load(): Promise<void> {
    const saved = await loadProjects();
    if (saved.length) {
      projects.value = saved.map(normalizeProject);
      for (const project of saved) {
        const legacy = project as Project & Partial<ProjectTreeState>;
        treeState[project.id] = createProjectTreeState({
          projectOpen: legacy.projectOpen ?? true,
          terminalOpen: legacy.terminalOpen ?? true,
          commandsOpen: legacy.commandsOpen ?? true,
        });
      }
    }
    loaded.value = true;
  }

  function add(): Project {
    const project: Project = {
      id: `project-${Date.now()}`,
      name: "New project",
      directory: ".",
      commands: [],
    };
    projects.value.push(project);
    treeState[project.id] = createProjectTreeState();
    return project;
  }

  function update(project: Project): void {
    const index = projects.value.findIndex((item) => item.id === project.id);
    if (index >= 0) projects.value[index] = normalizeProject(project);
  }

  function remove(id: string): boolean {
    if (projects.value.length === 1) return false;
    projects.value = projects.value.filter((project) => project.id !== id);
    delete treeState[id];
    return true;
  }

  function toggleProject(id: string): void {
    const state = stateFor(id);
    state.projectOpen = !state.projectOpen;
  }

  function toggleTerminals(id: string): void {
    const state = stateFor(id);
    state.terminalOpen = !state.terminalOpen;
  }

  function toggleCommands(id: string): void {
    const state = stateFor(id);
    state.commandsOpen = !state.commandsOpen;
  }

  function stateFor(id: string): ProjectTreeState {
    return (treeState[id] ??= createProjectTreeState());
  }

  watch(
    projects,
    (value) => {
      if (!loaded.value) return;
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = undefined;
        void saveProjects(value).catch((error) => console.error("Could not save projects", error));
      }, 200);
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  });

  return {
    projects,
    treeProjects,
    loaded,
    load,
    add,
    update,
    remove,
    toggleProject,
    toggleTerminals,
    toggleCommands,
  };
}

function normalizeProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    directory: project.directory,
    commands: project.commands?.map((command) => ({ ...command })) ?? [],
  };
}
