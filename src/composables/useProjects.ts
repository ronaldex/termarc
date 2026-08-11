import { computed, onBeforeUnmount, reactive, ref } from "vue";
import {
  loadLocalProjectCommands,
  loadProjects,
  loadProjectTreeState,
  saveLocalProjectCommands,
  saveProjectCommandOrder,
  saveProjects,
  saveProjectTreeState,
} from "../api/projects";
import type {
  Project,
  ProjectCommand,
  ProjectMetadataUpdate,
  ProjectTerminal,
  ProjectTreeProject,
  ProjectTreeState,
} from "../types/project";
import { normalizeProjectTerminals } from "../utils/projectTerminals";
import {
  effectiveCommandOrder,
  reorderCommands as reorderCommandStores,
} from "../utils/commandOrdering";
import type { DropPlacement } from "../utils/terminalOrdering";

const DEFAULT_PROJECT: Project = {
  id: "home",
  name: "Home",
  directory: "~",
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
  const persistenceDirty = ref(false);
  const persistenceSaving = ref(false);
  const persistenceError = ref<string>();
  let saveTimer: number | undefined;
  let savePromise: Promise<void> = Promise.resolve();
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
    if (persistenceDirty.value) await flushPersistence();
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
    markPersistenceDirty();
    return project;
  }

  async function update(project: ProjectMetadataUpdate): Promise<void> {
    const existing = projects.value.find((item) => item.id === project.id);
    if (!existing) return;
    if (existing.directory !== project.directory) {
      try {
        const localCommands = await loadLocalProjectCommands(project.directory);
        // Ranks in a different project's local file were calculated against a
        // different global list. Preserve each store's order, then rank the new
        // combination rather than treating expected cross-store collisions as corruption.
        const withoutRanks = (commands: ProjectCommand[]) =>
          [...commands].sort(compareCommandOrder).map(({ order: _order, ...command }) => command);
        const normalized = effectiveCommandOrder(
          withoutRanks(existing.globalCommands ?? []),
          withoutRanks(localCommands),
        );
        if (!normalized.ok) throw new Error(normalized.reason);
        if (normalized.localCommands.length)
          await saveLocalProjectCommands(project.directory, normalized.localCommands);
        updateEffectiveCommands(existing, normalized.globalCommands, normalized.localCommands);
        existing.localConfigError = undefined;
      } catch (error) {
        persistenceError.value = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }
    // Settings drafts intentionally update metadata only. Runtime terminal IDs and
    // mixed command ordering always remain owned by their domain workflows.
    existing.name = project.name;
    existing.directory = project.directory;
    existing.externalEditor = project.externalEditor;
    markPersistenceDirty();
  }

  function setProjectTerminals(projectId: string, terminals: ProjectTerminal[]): void {
    const project = projects.value.find((item) => item.id === projectId);
    if (!project) return;
    project.terminals = normalizeProjectTerminals(terminals) ?? [];
    markPersistenceDirty();
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
    markPersistenceDirty();
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
    markPersistenceDirty();
  }

  async function reorderCommands(
    projectId: string,
    movedCommandId: string,
    targetCommandId: string,
    placement: DropPlacement,
  ): Promise<void> {
    // Command transactions and whole-project snapshots share one queue, so a
    // snapshot cannot persist an optimistic order that subsequently rolls back.
    const queued = savePromise
      .catch(() => undefined)
      .then(async () => {
        await persistDirtyProjects();
        persistenceSaving.value = true;
        try {
          await performCommandReorder(projectId, movedCommandId, targetCommandId, placement);
        } finally {
          persistenceSaving.value = false;
        }
      });
    savePromise = queued;
    await queued;
  }

  async function performCommandReorder(
    projectId: string,
    movedCommandId: string,
    targetCommandId: string,
    placement: DropPlacement,
  ): Promise<void> {
    const project = projects.value.find((item) => item.id === projectId);
    if (!project) return;
    const previousGlobal = (project.globalCommands ?? []).map((command) => ({ ...command }));
    const previousLocal = (project.localCommands ?? []).map((command) => ({ ...command }));
    const result = reorderCommandStores(
      previousGlobal,
      previousLocal,
      movedCommandId,
      targetCommandId,
      placement,
    );
    if (!result.ok) throw new Error(result.reason);
    const previousOrder = effectiveCommandOrder(previousGlobal, previousLocal);
    if (
      previousOrder.ok &&
      result.orderedIds.every((id, index) => id === previousOrder.orderedIds[index])
    )
      return;

    updateEffectiveCommands(project, result.globalCommands, result.localCommands);
    try {
      await saveProjectCommandOrder(
        project.id,
        project.directory,
        result.globalCommands,
        result.localCommands,
      );
      persistenceError.value = undefined;
    } catch (failure) {
      updateEffectiveCommands(project, previousGlobal, previousLocal);
      persistenceError.value = commandOrderFailureMessage(failure);
      throw failure;
    }
  }

  function remove(id: string): boolean {
    if (projects.value.length === 1) return false;
    projects.value = projects.value.filter((project) => project.id !== id);
    delete treeState[id];
    scheduleTreeStateSave();
    markPersistenceDirty();
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

  function markPersistenceDirty(): void {
    persistenceDirty.value = true;
    if (!loaded.value) return;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      void flushPersistence().catch((error) => console.error("Could not save projects", error));
    }, 200);
  }

  async function persistDirtyProjects(): Promise<void> {
    if (!loaded.value || !persistenceDirty.value) return;
    const snapshot = projects.value.map(storedProject);
    persistenceDirty.value = false;
    persistenceSaving.value = true;
    try {
      await saveProjects(snapshot);
      persistenceError.value = undefined;
    } catch (error) {
      persistenceDirty.value = true;
      persistenceError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      persistenceSaving.value = false;
    }
  }

  async function flushPersistence(): Promise<void> {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    savePromise = savePromise.catch(() => undefined).then(persistDirtyProjects);
    return savePromise;
  }

  onBeforeUnmount(() => {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    if (persistenceDirty.value)
      void flushPersistence().catch((error) => console.error("Could not save projects", error));
    if (treeStateSaveTimer !== undefined) window.clearTimeout(treeStateSaveTimer);
  });

  return {
    projects,
    treeProjects,
    loaded,
    persistenceDirty,
    persistenceSaving,
    persistenceError,
    load,
    add,
    update,
    setProjectTerminals,
    saveCommand,
    removeCommand,
    reorderCommands,
    remove,
    toggleProject,
    toggleTerminals,
    toggleCommands,
    flushPersistence,
  };
}

function normalizeProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    directory: project.directory,
    externalEditor: project.externalEditor,
    commands: project.commands?.map((command) => ({ ...command })).sort(compareCommandOrder) ?? [],
    globalCommands:
      project.globalCommands?.map((command) => ({ ...command })).sort(compareCommandOrder) ??
      project.commands
        ?.filter((command) => command.storage !== "project")
        .map((command) => ({ ...command }))
        .sort(compareCommandOrder) ??
      [],
    localCommands:
      project.localCommands?.map((command) => ({ ...command })).sort(compareCommandOrder) ?? [],
    localConfigError: project.localConfigError,
    terminals: normalizeProjectTerminals(project.terminals),
  };
}

function replaceCommand(
  commands: ProjectCommand[],
  command: ProjectCommand,
  include: boolean,
): ProjectCommand[] {
  const index = commands.findIndex((item) => item.id === command.id);
  const withoutCommand = commands.filter((item) => item.id !== command.id);
  if (!include) return withoutCommand;
  const next = [...withoutCommand];
  next.splice(index >= 0 ? index : next.length, 0, {
    ...command,
    order: command.order ?? commands[index]?.order,
  });
  return next;
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
  commands.sort(compareCommandOrder);
  project.globalCommands = global.sort(compareCommandOrder);
  project.localCommands = local.sort(compareCommandOrder);
  project.commands = commands;
}

function commandOrderFailureMessage(failure: unknown): string {
  if (failure && typeof failure === "object" && "message" in failure)
    return String((failure as { message: unknown }).message);
  return failure instanceof Error ? failure.message : String(failure);
}

function compareCommandOrder(left: ProjectCommand, right: ProjectCommand): number {
  const leftOrder = Number.isFinite(left.order) ? left.order! : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isFinite(right.order) ? right.order! : Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder;
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
