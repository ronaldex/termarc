import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { loadProjects, saveProjects } from "../api/projects";
import type { Project } from "../types/project";

const DEFAULT_PROJECT: Project = {
  id: "project-1",
  name: "Current project",
  directory: ".",
  commands: [],
  terminalOpen: true,
  commandsOpen: true,
};

export function useProjects() {
  const projects = ref<Project[]>([{ ...DEFAULT_PROJECT }]);
  const loaded = ref(false);
  let saveTimer: number | undefined;

  async function load(): Promise<void> {
    const saved = await loadProjects();
    if (saved.length) projects.value = saved.map(normalizeProject);
    loaded.value = true;
  }

  function add(): Project {
    const project: Project = {
      id: `project-${Date.now()}`,
      name: "New project",
      directory: ".",
      commands: [],
      terminalOpen: true,
      commandsOpen: true,
    };
    projects.value.push(project);
    return project;
  }

  function update(project: Project): void {
    const index = projects.value.findIndex((item) => item.id === project.id);
    if (index >= 0) projects.value[index] = normalizeProject(project);
  }

  function remove(id: string): boolean {
    if (projects.value.length === 1) return false;
    projects.value = projects.value.filter((project) => project.id !== id);
    return true;
  }

  function toggleProject(id: string): void {
    const project = findProject(projects, id);
    if (!project) return;
    const open = !(project.terminalOpen || project.commandsOpen);
    project.terminalOpen = open;
    project.commandsOpen = open;
  }

  function toggleTerminals(id: string): void {
    const project = findProject(projects, id);
    if (project) project.terminalOpen = !project.terminalOpen;
  }

  function toggleCommands(id: string): void {
    const project = findProject(projects, id);
    if (project) project.commandsOpen = !project.commandsOpen;
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
    ...project,
    commands: project.commands ?? [],
    terminalOpen: project.terminalOpen ?? true,
    commandsOpen: project.commandsOpen ?? true,
  };
}

function findProject(projects: Ref<Project[]>, id: string): Project | undefined {
  return projects.value.find((project) => project.id === id);
}
