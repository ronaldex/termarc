import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  loadProjects,
  loadProjectTreeState,
  saveLocalProjectCommands,
  saveProjects,
  saveProjectTreeState,
} from "../api/projects";
import type {
  Project,
  ProjectCommand,
  ProjectTreeProject,
  ProjectTreeState,
} from "../types/project";
import { normalizeProjectTerminals } from "../utils/projectTerminals";

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
  let treeStateSaveTimer: number | undefined;

  async function load(): Promise<void> {
    const saved = await loadProjects();
    const savedTreeState = await loadProjectTreeState().catch((error) => {
      console.error("Could not load project tree state", error);
      return {} as Record<string, ProjectTreeState>;
    });
    if (saved.length) {
      projects.value = saved.map(normalizeProject);
      for (const project of saved) {
        const legacy = project as Project & Partial<ProjectTreeState>;
        treeState[project.id] = createProjectTreeState(
          savedTreeState[project.id] ?? {
            projectOpen: legacy.projectOpen ?? true,
            terminalOpen: legacy.terminalOpen ?? true,
            commandsOpen: legacy.commandsOpen ?? true,
          },
        );
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
      terminals: [],
    };
    projects.value.push(project);
    treeState[project.id] = createProjectTreeState();
    return project;
  }

  function update(project: Project): void {
    const index = projects.value.findIndex((item) => item.id === project.id);
    const existing = projects.value[index];
    if (!existing) return;

    // Terminal session state is maintained from the live tab list. Settings
    // forms may contain an older project snapshot and must not overwrite it.
    const terminals = normalizeProjectTerminals(existing.terminals);
    projects.value[index] = { ...normalizeProject(project), terminals };
  }

  async function saveCommand(project: Project, commandId: string): Promise<void> {
    const command = project.commands?.find((item) => item.id === commandId);
    if (!command) return;
    const existing = projects.value.find((item) => item.id === project.id);
    if (!existing) return;
    const storage = command.storage ?? "global";
    const wasLocal = existing.localCommands?.some((item) => item.id === command.id) ?? false;
    const globalCommands = replaceCommand(
      existing.globalCommands ?? [],
      command,
      storage === "global",
    );
    const localCommands = replaceCommand(
      existing.localCommands ?? [],
      command,
      storage === "project",
    );
    if (storage === "project" || wasLocal)
      await saveLocalProjectCommands(existing.directory, localCommands);
    updateEffectiveCommands(existing, globalCommands, localCommands);
  }

  async function removeCommand(projectId: string, commandId: string): Promise<void> {
    const existing = projects.value.find((item) => item.id === projectId);
    if (!existing) return;
    const command = existing.commands?.find((item) => item.id === commandId);
    if (!command) return;
    const globalCommands = (existing.globalCommands ?? []).filter((item) => item.id !== commandId);
    const localCommands = (existing.localCommands ?? []).filter((item) => item.id !== commandId);
    if (command.storage === "project")
      await saveLocalProjectCommands(existing.directory, localCommands);
    updateEffectiveCommands(existing, globalCommands, localCommands);
  }

  function remove(id: string): boolean {
    if (projects.value.length === 1) return false;
    projects.value = projects.value.filter((project) => project.id !== id);
    delete treeState[id];
    scheduleTreeStateSave();
    return true;
  }

  function toggleProject(id: string): void {
    const state = stateFor(id);
    state.projectOpen = !state.projectOpen;
    scheduleTreeStateSave();
  }

  function toggleTerminals(id: string): void {
    const state = stateFor(id);
    state.terminalOpen = !state.terminalOpen;
    scheduleTreeStateSave();
  }

  function toggleCommands(id: string): void {
    const state = stateFor(id);
    state.commandsOpen = !state.commandsOpen;
    scheduleTreeStateSave();
  }

  function scheduleTreeStateSave(): void {
    if (!loaded.value) return;
    if (treeStateSaveTimer !== undefined) window.clearTimeout(treeStateSaveTimer);
    treeStateSaveTimer = window.setTimeout(() => {
      treeStateSaveTimer = undefined;
      void saveProjectTreeState(treeState).catch((error) =>
        console.error("Could not save project tree state", error),
      );
    }, 200);
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
        void saveProjects(value.map(storedProject)).catch((error) =>
          console.error("Could not save projects", error),
        );
      }, 200);
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    if (treeStateSaveTimer !== undefined) window.clearTimeout(treeStateSaveTimer);
  });

  return {
    projects,
    treeProjects,
    loaded,
    load,
    add,
    update,
    saveCommand,
    removeCommand,
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
    externalEditor: project.externalEditor,
    commands: project.commands?.map((command) => ({ ...command })) ?? [],
    globalCommands:
      project.globalCommands?.map((command) => ({ ...command })) ??
      project.commands
        ?.filter((command) => command.storage !== "project")
        .map((command) => ({ ...command })) ??
      [],
    localCommands: project.localCommands?.map((command) => ({ ...command })) ?? [],
    localConfigError: project.localConfigError,
    terminals: normalizeProjectTerminals(project.terminals),
  };
}

function replaceCommand(
  commands: ProjectCommand[],
  command: ProjectCommand,
  include: boolean,
): ProjectCommand[] {
  const withoutCommand = commands.filter((item) => item.id !== command.id);
  return include ? [...withoutCommand, { ...command }] : withoutCommand;
}

function updateEffectiveCommands(
  project: Project,
  globalCommands: ProjectCommand[],
  localCommands: ProjectCommand[],
): void {
  const global: ProjectCommand[] = globalCommands.map((command) => ({
    ...command,
    storage: "global",
  }));
  const local: ProjectCommand[] = localCommands.map((command) => ({
    ...command,
    storage: "project",
  }));
  const commands: ProjectCommand[] = [...global];
  for (const command of local) {
    const index = commands.findIndex((item) => item.id === command.id);
    if (index >= 0) commands[index] = command;
    else commands.push(command);
  }
  project.globalCommands = global;
  project.localCommands = local;
  project.commands = commands;
}

function storedProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    directory: project.directory,
    externalEditor: project.externalEditor,
    commands: (project.globalCommands ?? project.commands ?? [])
      .filter((command) => command.storage !== "project")
      .map(({ storage: _storage, ...command }) => command),
    terminals: normalizeProjectTerminals(project.terminals),
  };
}
