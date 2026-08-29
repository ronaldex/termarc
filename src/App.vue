<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppTitlebar from "./components/layout/AppTitlebar.vue";
import ParentCloseDialog from "./components/terminal/ParentCloseDialog.vue";
import KeyboardShortcutsView from "./components/workspace/KeyboardShortcutsView.vue";
import TerminalSidebar from "./components/sidebar/TerminalSidebar.vue";
import TerminalPresentationShell from "./components/workspace/TerminalPresentationShell.vue";
import { useProjects } from "./composables/useProjects";
import { useSidebarActivation } from "./composables/useSidebarActivation";
import { useSidebarLayout } from "./composables/useSidebarLayout";
import { useRightSidebarController } from "./composables/useRightSidebarController";
import { useTerminalFamilyClose } from "./composables/useTerminalFamilyClose";
import { useTerminalPresentation } from "./composables/useTerminalPresentation";
import { useTerminalTabs } from "./composables/useTerminalTabs";
import { useWorkspaceSelection } from "./composables/useWorkspaceSelection";
import { useWorkspaceShortcuts } from "./composables/useWorkspaceShortcuts";
import { useWorkspaceTerminalNavigation } from "./composables/useWorkspaceTerminalNavigation";
import { useAppSettings } from "./composables/useAppSettings";
import { useCommandRuns } from "./composables/useCommandRuns";
import { selectDirectory } from "./api/dialog";
import { detachSubagents } from "./api/subagentSpawns";
import { loadCustomThemes } from "./api/themes";
import { resolveExternalEditor } from "./settings/options";
import { applyAppTheme, registerCustomThemes } from "./themes/themeCatalog";
import { configurePlatformWindowStyle } from "./services/platformWindowStyle";
import { createSubagentSpawnService } from "./services/subagentSpawns";
import {
  loadWorkspaceSelection,
  resolveWorkspaceSelection,
  saveWorkspaceSelection,
} from "./services/workspaceState";
import { isMacOS } from "./utils/platform";
import { projectNameFromDirectory } from "./utils/projectName";
import type { ParentCloseChoice } from "./utils/parentClose";
import { numberedSidebarShortcuts } from "./utils/sidebarShortcuts";
import { terminalShortcutOrder } from "./utils/terminalTabs";
import { projectTerminalsEqual, projectTerminalsFromTabs } from "./utils/projectTerminals";
import type { Project } from "./types/project";
import type { SidebarSelection } from "./types/sidebar";

const TITLEBAR_HEIGHT = 32;
const macOS = isMacOS();

const { settings, load: loadAppSettings } = useAppSettings();
const renameModalOpen = ref(false);
const keyboardShortcutsOpen = ref(false);
const parentCloseChildCount = ref<number>();
const terminalShortcutScopeActive = computed(
  () => renameModalOpen.value || parentCloseChildCount.value !== undefined,
);
let resolveParentClose: ((choice: ParentCloseChoice) => void) | undefined;

function chooseParentClose(choice: ParentCloseChoice): void {
  parentCloseChildCount.value = undefined;
  resolveParentClose?.(choice);
  resolveParentClose = undefined;
}

function askParentClose(childCount: number): Promise<ParentCloseChoice> {
  chooseParentClose("cancel");
  parentCloseChildCount.value = childCount;
  return new Promise((resolve) => {
    resolveParentClose = resolve;
  });
}
const toast = ref<{ message: string; kind: "success" | "error" }>();
let toastTimeout: number | undefined;

function showToast(message: string, kind: "success" | "error"): void {
  toast.value = { message, kind };
  if (toastTimeout !== undefined) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.value = undefined;
    toastTimeout = undefined;
  }, 2200);
}

function notifyTerminalCopy(result: "copied" | "failed"): void {
  showToast(
    result === "copied" ? "Copied to clipboard" : "Could not copy terminal selection",
    result === "copied" ? "success" : "error",
  );
}
const {
  projects,
  treeProjects,
  load: loadProjectConfiguration,
  add: addProjectState,
  update: updateProject,
  setProjectTerminals,
  saveCommand: saveProjectCommand,
  saveAgent: saveAgentState,
  removeCommand: removeProjectCommand,
  removeAgent: removeAgentState,
  reorderCommands: reorderCommandState,
  remove: removeProjectState,
  toggleProject,
  toggleTerminals,
  toggleCommands,
  toggleAgents,
  persistenceDirty,
  persistenceSaving,
  persistenceError,
  flushPersistence,
} = useProjects();

const sidebarFilter = ref("");

function editorForProject(projectId: string) {
  const project = projects.value.find((item) => item.id === projectId);
  return resolveExternalEditor(project?.externalEditor, settings.externalEditor);
}

const {
  tabs,
  activeTabId,
  activeTab,
  isEmpty,
  createTab,
  startTab,
  selectTab,
  closeTab,
  copyTerminal,
  pasteTerminal,
  setTerminalTitleOverride,
  setTabShortcutOrder,
  reorderProjectTerminals: reorderTerminalTabs,
  restartTab,
  stopTab,
  terminalContainerRef,
  attachHost,
  fitActiveTerminalAfterLayout,
  setDefaultProject,
  isTerminalFocused,
  focusActiveTerminal,
  start,
  dispose,
} = useTerminalTabs({
  isShortcutScopeActive: () => terminalShortcutScopeActive.value,
  externalEditorForProject: editorForProject,
  activateNumberedShortcut(number) {
    const shortcut = numberedSidebarShortcuts(
      treeProjects.value,
      tabs,
      leftSidebarOpen.value ? sidebarFilter.value : "",
    ).find((item) => item.number === number);
    if (!shortcut) return false;
    if (shortcut.selection.kind === "command" || shortcut.selection.kind === "agent") {
      if (shortcut.selection.kind === "agent")
        selectAgent(shortcut.selection.projectId, shortcut.selection.commandId);
      else selectCommandSelection(shortcut.selection.projectId, shortcut.selection.commandId);
      restoreLeftPreference();
      requestAnimationFrame(() => terminalPresentationShell.value?.focusContent());
    } else {
      activateSidebar(shortcut.selection);
    }
    return true;
  },
  onCopy: notifyTerminalCopy,
});
const commandRuns = useCommandRuns({ tabs, createTab, restartTab, stopTab, closeTab });
const subagentSpawns = createSubagentSpawnService({ createTab, startTab, closeTab });
watch(
  () => tabs.map((tab) => ({ id: tab.id, projectId: tab.projectId, launch: tab.launch })),
  () => subagentSpawns.update(tabs),
  { deep: true, immediate: true },
);
const terminalSidebar = ref<InstanceType<typeof TerminalSidebar>>();
const terminalPresentationShell = ref<InstanceType<typeof TerminalPresentationShell>>();
const gitSidebarAvailable = ref(false);
const mainTerminalId = ref<string>();
const lastProjectId = ref<string>();
let appDisposed = false;
let workspaceStateReady = false;
let closeInProgress = false;
let unlistenCloseRequested: (() => void) | undefined;
const {
  leftOpen: leftSidebarOpen,
  leftPresentation: leftSidebarPresentation,
  rightOpen: rightSidebarOpen,
  rightPresentation: rightSidebarPresentation,
  leftWidth: leftSidebarWidth,
  rightWidth: rightSidebarWidth,
  openLeftTemporarily,
  restoreLeftPreference,
  toggleLeft,
  openRightTemporarily,
  restoreRightPreference,
  toggleRight,
  closeRight,
  startResize,
} = useSidebarLayout();
let rightSidebarController: ReturnType<typeof useRightSidebarController>;
const terminalPresentation = useTerminalPresentation({
  tabs,
  activeTabId,
  mainTerminalId,
  selectTab,
  focusTerminal: focusActiveTerminal,
  focusWorkspaceContent: () => terminalPresentationShell.value?.focusContent(),
  focusSidebarPanel: () => terminalPresentationShell.value?.focusSubterminalPanel(),
  fitAfterLayout: fitActiveTerminalAfterLayout,
  resetRightSidebarMode: () => rightSidebarController.resetOpenMode(),
});
const {
  family: terminalFamily,
  sidebarIds: subterminalIds,
  present: presentTerminal,
  focusFamily: focusFamilyTerminal,
  maximize: maximizeTerminal,
  focusMain: focusMainTerminal,
  cycle: cycleFocusedSubterminal,
} = terminalPresentation;
rightSidebarController = useRightSidebarController({
  subterminalsAvailable: computed(() => subterminalIds.value.length > 0),
  gitAvailable: gitSidebarAvailable,
  open: rightSidebarOpen,
  openTemporarily: openRightTemporarily,
  restorePreference: restoreRightPreference,
  toggle: toggleRight,
  close: closeRight,
  focusPanel: () => terminalPresentationShell.value?.focusPanel(),
  hasPanelFocus: () => terminalPresentationShell.value?.hasPanelFocus() ?? false,
  focusWorkspace: () => terminalPresentationShell.value?.focusContent(),
  focusTerminal: focusMainTerminal,
});
const {
  open: effectiveRightSidebarOpen,
  mode: rightSidebarMode,
  modes: rightSidebarModes,
  select: selectRightSidebarMode,
  preview: previewRightSidebarMode,
  openAndFocus: focusRightSidebar,
  resetOpenMode: resetOpenRightSidebarMode,
  moveAndFocus: moveRightSidebarFocus,
  toggle: toggleRightSidebar,
  close: closeRightSidebar,
  focusWorkspace: focusWorkspaceFromRight,
  restoreOnBlur: restoreRightSidebarOnBlur,
} = rightSidebarController;
const terminalPersistenceEligible = new Set<string>();

function toggleLeftSidebar(): void {
  const closing = leftSidebarOpen.value;
  toggleLeft();
  if (closing) requestAnimationFrame(() => terminalPresentationShell.value?.focusContent());
}

function persistOpenTerminals(): void {
  for (const project of projects.value) {
    if (!terminalPersistenceEligible.has(project.id)) continue;
    const terminals = projectTerminalsFromTabs(tabs, project.id);
    if (!projectTerminalsEqual(project.terminals, terminals))
      setProjectTerminals(project.id, terminals);
  }
}

function retryOrDismissPersistenceError(): void {
  if (persistenceDirty.value)
    void flushPersistence().catch((error) => console.error("Could not save projects", error));
  else persistenceError.value = undefined;
}

function reorderCommands(
  projectId: string,
  movedCommandId: string,
  targetCommandId: string,
  placement: "before" | "after",
): void {
  void reorderCommandState(projectId, movedCommandId, targetCommandId, placement).catch((error) =>
    console.error("Could not persist command order", error),
  );
}

function reorderProjectTerminals(
  projectId: string,
  movedTabId: string,
  targetTabId: string,
  placement: "before" | "after",
): void {
  terminalPersistenceEligible.add(projectId);
  reorderTerminalTabs(projectId, movedTabId, targetTabId, placement);
  persistOpenTerminals();
  void flushPersistence().catch((error) =>
    console.error("Could not persist terminal order", error),
  );
}

watch(
  () =>
    tabs.map((tab) => ({
      id: tab.id,
      projectId: tab.projectId,
      kind: tab.launch.kind,
      customTitle: tab.customTitle,
    })),
  persistOpenTerminals,
  { deep: true },
);

watch(
  () => terminalShortcutOrder(tabs, treeProjects.value),
  (orderedIds) => setTabShortcutOrder(orderedIds),
  { immediate: true },
);

const {
  selection: sidebarSelection,
  selectedProject,
  focus: setSidebarSelection,
  selectProject,
  selectTerminal,
  selectAddTerminal,
  selectCommands,
  selectAgents,
  selectAgent,
  selectAddAgent,
  selectEditAgent,
  selectCommand: selectCommandSelection,
  selectAddCommand,
  selectEditCommand,
  selectProjectManagement,
  openSettings,
} = useWorkspaceSelection(projects);
watch(
  sidebarSelection,
  (selection) => {
    persistOpenTerminals();
    if (!workspaceStateReady) return;
    const main = tabs.find((tab) => tab.id === mainTerminalId.value);
    if (
      main &&
      (selection.kind === "terminal" || selection.kind === "subagent") &&
      selection.tabId !== main.id
    ) {
      saveWorkspaceSelection(
        main.launch.kind === "subagent"
          ? {
              id: main.id,
              kind: "subagent",
              projectId: main.projectId,
              tabId: main.id,
              parentTerminalId: main.launch.parentTerminalId,
            }
          : { id: main.id, kind: "terminal", projectId: main.projectId, tabId: main.id },
      );
    } else saveWorkspaceSelection(selection);
  },
  { deep: true },
);
const selectedExternalEditor = computed(() =>
  resolveExternalEditor(selectedProject.value?.externalEditor, settings.externalEditor),
);
const { focusSidebar, activateSidebar: activateSidebarSelection } = useSidebarActivation({
  projects,
  tabs,
  activeTab,
  activeTabId,
  findCommandRun: commandRuns.find,
  setSelection: setSidebarSelection,
  setDefaultProject,
  selectTerminal,
  selectTab,
  runCommand: (projectId, commandId) => void runCommand(projectId, commandId),
  runAgent: (projectId, commandId) => void runAgent(projectId, commandId),
  startTerminal: (tabId) => void startProjectTerminal(tabId),
  createProjectTerminal: (projectId, directory) => void createProjectTerminal(projectId, directory),
  activateFamilyTerminal: (tab) => {
    presentTerminal(tab.id);
    if (tab.id !== mainTerminalId.value) focusRightSidebar("subterminals");
  },
  activateWorkspaceTerminal: (tab) => presentTerminal(tab.id, true),
  clearWorkspaceTerminal: () => {
    mainTerminalId.value = undefined;
    resetOpenRightSidebarMode();
  },
});
function activateSidebar(selection: SidebarSelection): void {
  activateSidebarSelection(selection);
  restoreLeftPreference();
}
const { cycleTerminal: cycleSidebarTerminal, closeTerminal } = useWorkspaceTerminalNavigation({
  tabs,
  projects: treeProjects,
  selection: sidebarSelection,
  focusContent: () => terminalPresentationShell.value?.focusContent(),
  focusSidebar,
  selectTab,
  selectTerminal,
  selectAddTerminal,
  closeTab,
  focusSidebarTree: () => terminalSidebar.value?.focusTree(),
});
const terminalFamilyClose = useTerminalFamilyClose({
  tabs,
  activeTabId,
  mainTerminalId,
  ask: askParentClose,
  detach: detachSubagents,
  closeChild: closeTab,
  closeTerminal,
  selectTab,
  selectAfterClose: terminalPresentation.selectAfterClose,
  markPersistenceEligible: (projectId) => terminalPersistenceEligible.add(projectId),
  reportError(message, error) {
    console.error(message, error);
    showToast(message, "error");
  },
});

async function createProjectTerminal(
  projectId: string,
  cwd: string,
  parentTerminalId?: string,
): Promise<void> {
  const tab = await createTab(projectId, cwd, { parentTerminalId });
  if (!tab) return;
  terminalPersistenceEligible.add(projectId);
  selectTerminal(projectId, tab.id);
  presentTerminal(tab.id, !tab.parentTerminalId);
  selectTab(tab.id);
}

async function startProjectProcesses(projectId: string): Promise<void> {
  const project = projects.value.find((item) => item.id === projectId);
  if (!project) return;

  for (const tab of tabs.filter(
    (item) => item.projectId === projectId && item.launch.kind === "shell",
  )) {
    if (tab.status !== "stopped" && tab.status !== "error") continue;
    try {
      if (tab.status === "error" && tab.session) await restartTab(tab);
      else await startTab(tab);
    } catch (error) {
      console.error(`Could not start terminal for ${project.name}`, error);
    }
  }
  for (const command of project.commands ?? []) {
    if (!command.autostart) continue;
    try {
      await commandRuns.run(project, command, "command", false);
    } catch (error) {
      console.error(`Could not start command ${command.name}`, error);
    }
  }
  for (const agent of project.agents ?? []) {
    if (!agent.autostart) continue;
    try {
      await commandRuns.run(project, agent, "agent", false);
    } catch (error) {
      console.error(`Could not start agent ${agent.name}`, error);
    }
  }
}

async function startProjectTerminal(tabId: string): Promise<void> {
  const tab = tabs.find((item) => item.id === tabId && item.launch.kind === "shell");
  const canStart = tab?.status === "stopped" || tab?.status === "error";
  if (!tab || !canStart) return;
  selectTerminal(tab.projectId, tab.id);
  selectTab(tab.id);
  restoreLeftPreference();
  if (tab.status === "error" && tab.session) await restartTab(tab);
  else await startTab(tab);
  focusActiveTerminal();
}
function saveProjectMetadata(project: Project): void {
  void updateProject(project).catch((error) =>
    console.error("Could not update project settings", error),
  );
}
function openKeyboardShortcutsModal(): void {
  keyboardShortcutsOpen.value = true;
}

function closeKeyboardShortcuts(): void {
  keyboardShortcutsOpen.value = false;
}

function manageProjects(projectId?: string): void {
  const project = projects.value.find((item) => item.id === projectId);
  if (project) selectProject(project);
  else selectProjectManagement(selectedProject.value?.id ?? projects.value[0].id);
}
async function addProject(): Promise<void> {
  let directory: string | null;
  try {
    directory = await selectDirectory({ title: "Select project directory" });
  } catch (error) {
    console.error("Could not open directory picker", error);
    showToast("Could not open directory picker", "error");
    return;
  }
  if (!directory) return;
  const project = addProjectState({ directory, name: projectNameFromDirectory(directory) });
  terminalPersistenceEligible.add(project.id);
  selectProject(project);
}
async function closeProjectTerminal(id: string): Promise<void> {
  await terminalFamilyClose.close(id);
}

async function copyProjectTerminal(id: string): Promise<void> {
  const result = await copyTerminal(id);
  showToast(
    result === "copied"
      ? "Copied to clipboard"
      : result === "empty"
        ? "No terminal selection"
        : "Could not copy terminal selection",
    result === "copied" ? "success" : "error",
  );
}

async function pasteProjectTerminal(id: string): Promise<void> {
  const result = await pasteTerminal(id);
  if (result === "pasted") return;
  showToast(result === "empty" ? "Clipboard is empty" : "Could not paste into terminal", "error");
}
function setProjectTerminalTitle(id: string, title: string): void {
  const projectId = tabs.find((tab) => tab.id === id && tab.launch.kind === "shell")?.projectId;
  if (projectId) terminalPersistenceEligible.add(projectId);
  setTerminalTitleOverride(id, title);
}
async function removeProject(projectId: string): Promise<void> {
  await Promise.all(
    tabs.filter((tab) => tab.projectId === projectId).map((tab) => closeTab(tab.id)),
  );
  removeProjectState(projectId);
  terminalPersistenceEligible.delete(projectId);
}
function selectCommand(projectId: string, commandId?: string): void {
  if (commandId) selectCommandSelection(projectId, commandId);
  else selectAddCommand(projectId);
}
function editCommand(projectId: string, commandId: string): void {
  selectEditCommand(projectId, commandId);
}
async function runAgent(projectId: string, agentId: string): Promise<void> {
  const project = projects.value.find((item) => item.id === projectId);
  const agent = project?.agents?.find((item) => item.id === agentId);
  if (!project || !agent) return;
  const tab = await commandRuns.run(project, agent, "agent");
  if (!tab) return;
  activeTabId.value = tab.id;
  presentTerminal(tab.id, true);
  selectAgent(projectId, agentId);
  selectTab(tab.id);
}
async function stopAgent(projectId: string, agentId: string): Promise<void> {
  await commandRuns.stop(projectId, agentId, "agent");
}
async function stopSubagent(tabId: string): Promise<void> {
  const tab = tabs.find((item) => item.id === tabId && item.launch.kind === "subagent");
  if (tab) await stopTab(tab);
}
async function runCommand(projectId: string, commandId: string): Promise<void> {
  const project = projects.value.find((item) => item.id === projectId);
  const command = project?.commands?.find((item) => item.id === commandId);
  if (!project || !command) return;
  const tab = await commandRuns.run(project, command);
  if (!tab) return;
  activeTabId.value = tab.id;
  presentTerminal(tab.id, true);
  selectCommand(projectId, commandId);
  selectTab(tab.id);
}
async function reloadCommand(projectId: string, commandId: string): Promise<void> {
  await runCommand(projectId, commandId);
}
async function stopCommand(projectId: string, commandId: string): Promise<void> {
  await commandRuns.stop(projectId, commandId);
}
function showCommands(projectId: string): void {
  selectCommands(projectId);
}
function showAgents(projectId: string): void {
  selectAgents(projectId);
}
function selectAgentFromWorkspace(projectId: string, agentId?: string): void {
  if (agentId) selectEditAgent(projectId, agentId);
  else selectAddAgent(projectId);
}
async function saveAgent(project: Project, agentId: string): Promise<void> {
  try {
    await saveAgentState(project, agentId);
    await flushPersistence();
    showAgents(project.id);
    showToast("Agent saved", "success");
  } catch (error) {
    console.error("Could not save agent", error);
    showToast("Could not save agent", "error");
  }
}
async function removeAgent(project: Project, agentId: string): Promise<void> {
  await commandRuns.remove(project.id, agentId, "agent");
  await removeAgentState(project.id, agentId);
  showAgents(project.id);
}
async function saveCommand(project: Project, commandId: string): Promise<void> {
  await saveProjectCommand(project, commandId);
  const updatedProject = projects.value.find((item) => item.id === project.id);
  if (updatedProject) selectProject(updatedProject);
}
async function removeCommand(project: Project, commandId: string): Promise<void> {
  await commandRuns.remove(project.id, commandId);
  await removeProjectCommand(project.id, commandId);
  showCommands(project.id);
}

function deleteCommandFromMenu(projectId: string, commandId: string): void {
  const project = projects.value.find((item) => item.id === projectId);
  if (project) void removeCommand(project, commandId);
}
function editAgentFromMenu(projectId: string, agentId: string): void {
  selectEditAgent(projectId, agentId);
}
function deleteAgentFromMenu(projectId: string, agentId: string): void {
  const project = projects.value.find((item) => item.id === projectId);
  if (project) void removeAgent(project, agentId);
}

useWorkspaceShortcuts({
  sidebar: terminalSidebar,
  workspace: terminalPresentationShell,
  rightSidebar: terminalPresentationShell,
  openLeftSidebar: openLeftTemporarily,
  restoreLeftSidebar: restoreLeftPreference,
  toggleLeftSidebar,
  focusRightSidebar,
  focusWorkspaceFromRight,
  restoreRightSidebarOnBlur,
  moveRightSidebarFocus,
  cycleSubterminal: cycleFocusedSubterminal,
  toggleRightSidebar,
  closeRightSidebar,
  gitSidebarAvailable,
  rightSidebarAvailable: computed(() => rightSidebarModes.value.length > 0),
  rightSidebarMode,
  rightSidebarModes,
  selection: sidebarSelection,
  projects,
  lastProjectId,
  isTerminalFocused,
  isSubterminalFocused: () => terminalPresentationShell.value?.hasSubterminalFocus() ?? false,
  selectProject,
  openSettings,
  focusProjectByNumber(number) {
    const project = treeProjects.value[number - 1];
    if (!project) return;
    focusSidebar({ id: project.id, kind: "project", projectId: project.id });
    openLeftTemporarily();
    requestAnimationFrame(() => terminalSidebar.value?.focusTree());
  },
  cycleTerminal: cycleSidebarTerminal,
  activeTerminalAvailable: () => Boolean(activeTab.value),
  createTerminal: () => {
    const project =
      selectedProject.value ??
      projects.value.find((item) => item.id === lastProjectId.value) ??
      projects.value[0];
    if (project) void createProjectTerminal(project.id, project.directory);
  },
  createSubterminal: () => {
    const active = activeTab.value;
    if (!active || active.launch.kind === "subagent") return;
    // A subterminal creates a sibling beneath its main terminal, never a sub-subterminal.
    const parent = active.parentTerminalId
      ? tabs.find((tab) => tab.id === active.parentTerminalId)
      : active;
    if (parent)
      void createProjectTerminal(
        parent.projectId,
        active.currentCwd ?? parent.currentCwd ?? parent.cwd,
        parent.id,
      );
  },
  closeActiveTerminal: () => {
    if (activeTab.value) void closeProjectTerminal(activeTab.value.id);
  },
  shouldActivateSidebar(selection) {
    return (
      selection.kind === "terminal" ||
      selection.kind === "subagent" ||
      (selection.kind === "command" &&
        Boolean(commandRuns.find(selection.projectId, selection.commandId))) ||
      (selection.kind === "agent" &&
        Boolean(commandRuns.find(selection.projectId, selection.commandId, "agent")))
    );
  },
  activateSidebar,
  openSettings,
  openKeyboardShortcuts: openKeyboardShortcutsModal,
  shortcutScopeActive: terminalShortcutScopeActive,

  shortcutModifier: computed(() => settings.shortcutModifier),
});

onMounted(async () => {
  configurePlatformWindowStyle();
  void subagentSpawns
    .start()
    .catch((error) => console.error("Could not listen for subagent spawn requests", error));
  void getCurrentWindow()
    .onCloseRequested(async (event) => {
      event.preventDefault();
      if (closeInProgress) return;
      closeInProgress = true;
      persistOpenTerminals();
      try {
        await flushPersistence();
      } catch (error) {
        console.error("Could not flush projects before closing", error);
      } finally {
        unlistenCloseRequested?.();
        unlistenCloseRequested = undefined;
        await getCurrentWindow().close();
      }
    })
    .then((unlisten) => {
      if (appDisposed) unlisten();
      else unlistenCloseRequested = unlisten;
    })
    .catch((error) => console.error("Could not listen for window close", error));
  try {
    const themes = await loadCustomThemes();
    registerCustomThemes(Object.fromEntries(themes.map((theme) => [theme.id, theme])));
  } catch (error) {
    console.error("Could not load custom themes", error);
  }
  loadAppSettings();
  try {
    await loadProjectConfiguration();
  } catch (error) {
    console.error("Could not load projects", error);
  }
  if (appDisposed) return;
  const initialProject = projects.value[0];
  start(initialProject.id, initialProject.directory);

  for (const project of projects.value) {
    let projectRestoreSucceeded = true;
    for (const terminal of project.terminals ?? []) {
      try {
        const tab = await createTab(project.id, project.directory, {
          id: terminal.id,
          customTitle: terminal.customTitle,
          parentTerminalId: terminal.parentTerminalId,
          start: false,
          activate: false,
        });
        if (!tab) {
          projectRestoreSucceeded = false;
          continue;
        }
      } catch (error) {
        projectRestoreSucceeded = false;
        console.error(`Could not restore a terminal for ${project.name}`, error);
      }
    }
    if (projectRestoreSucceeded) terminalPersistenceEligible.add(project.id);
  }

  // Restore the last stable workspace page after all referenced projects and
  // terminals exist. Processes are deliberately not started during app startup;
  // the project-row play button remains the explicit autostart action.
  const restoredSelection = resolveWorkspaceSelection(
    loadWorkspaceSelection(),
    projects.value,
    tabs,
  );
  if (restoredSelection) setSidebarSelection(restoredSelection);
  else selectProject(initialProject);

  if (restoredSelection?.kind === "terminal" || restoredSelection?.kind === "subagent") {
    presentTerminal(restoredSelection.tabId);
    selectTab(restoredSelection.tabId);
  }
  workspaceStateReady = true;
  saveWorkspaceSelection(sidebarSelection.value);

  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (sidebarSelection.value.kind === "terminal") focusActiveTerminal();
      if (!isTerminalFocused()) terminalPresentationShell.value?.focusContent();
    });
  });

  // Do not let intermediate restoration states overwrite the saved layout.
  // If restoration failed, retain the saved state rather than persisting a
  // partial terminal list.
  persistOpenTerminals();
});
watch(
  () => settings.terminalFontSize,
  (fontSize) => {
    document.documentElement.style.fontSize = `${fontSize * (16 / 13)}px`;
  },
  { immediate: true },
);
watch(
  () => settings.colorTheme,
  (theme) => applyAppTheme(theme),
  { immediate: true },
);

watch(selectedProject, (project) => {
  gitSidebarAvailable.value = false;
  if (project) {
    lastProjectId.value = project.id;
    setDefaultProject(project.id, project.directory);
  }
});
watch(activeTabId, (id) => {
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    if (!terminalFamilyClose.suppressPresentation.value) presentTerminal(tab.id);
    const project = projects.value.find((item) => item.id === tab.projectId);
    if (!project) return;
    if (tab.launch.kind === "command") {
      if ((tab.launch.source ?? "command") === "agent")
        selectAgent(project.id, tab.launch.commandId);
      else selectCommand(project.id, tab.launch.commandId);
    } else if (tab.launch.kind === "subagent") {
      setSidebarSelection({
        id: tab.id,
        kind: "subagent",
        projectId: tab.projectId,
        tabId: tab.id,
        parentTerminalId: tab.launch.parentTerminalId,
      });
    } else selectTerminal(project.id, tab.id);
  }
});
watch(
  [leftSidebarOpen, rightSidebarOpen, sidebarSelection, rightSidebarMode],
  fitActiveTerminalAfterLayout,
  { flush: "post" },
);
onBeforeUnmount(() => {
  appDisposed = true;
  if (toastTimeout !== undefined) window.clearTimeout(toastTimeout);
  unlistenCloseRequested?.();
  unlistenCloseRequested = undefined;
  persistOpenTerminals();
  void flushPersistence().catch((error) => console.error("Could not flush projects", error));
  subagentSpawns.dispose();
  dispose();
});
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'without-right-sidebar': rightSidebarModes.length === 0,
      'left-sidebar-overlay': leftSidebarPresentation === 'overlay',
      'left-sidebar-collapsed': leftSidebarPresentation === 'collapsed',
      'right-sidebar-overlay': rightSidebarPresentation === 'overlay',
      'right-sidebar-collapsed': rightSidebarPresentation === 'collapsed',
      linux: !macOS,
    }"
    :style="{
      '--titlebar-height': `${TITLEBAR_HEIGHT}px`,
      '--left-sidebar-width': `${leftSidebarWidth}px`,
      '--right-sidebar-width': `${rightSidebarWidth}px`,
    }"
  >
    <AppTitlebar :active-tab="activeTab" :macos="macOS" />
    <span v-if="persistenceSaving" class="app-sr-only" role="status">
      Saving workspace configuration
    </span>
    <div v-if="persistenceError" class="persistence-error" role="alert">
      <span>Could not save workspace configuration: {{ persistenceError }}</span>
      <button type="button" :disabled="persistenceSaving" @click="retryOrDismissPersistenceError">
        {{ persistenceSaving ? "Retrying…" : persistenceDirty ? "Retry" : "Dismiss" }}
      </button>
    </div>
    <div v-if="toast" class="app-toast" :class="`app-toast-${toast.kind}`" role="status">
      {{ toast.message }}
    </div>
    <TerminalSidebar
      ref="terminalSidebar"
      :class="{
        'sidebar-hidden': !leftSidebarOpen,
        overlay: leftSidebarPresentation === 'overlay',
      }"
      :style="{
        width: leftSidebarOpen ? `${leftSidebarWidth}px` : 'var(--sidebar-collapsed-width)',
      }"
      :collapsed="!leftSidebarOpen"
      :tabs="tabs"
      :shortcut-modifier="settings.shortcutModifier"
      :projects="treeProjects"
      :filter="sidebarFilter"
      :selection="sidebarSelection"
      :is-terminal-focused="isTerminalFocused"
      @focus="focusSidebar"
      @activate="activateSidebar"
      @filter-change="sidebarFilter = $event"
      @add-project="addProject"
      @manage="manageProjects"
      @open-settings="openSettings"
      @open-keyboard-shortcuts="openKeyboardShortcutsModal"
      @toggle-project="toggleProject"
      @start-project="startProjectProcesses"
      @toggle-terminals="toggleTerminals"
      @toggle-commands="toggleCommands"
      @toggle-agents="toggleAgents"
      @run-agent="runAgent"
      @reload-agent="runAgent"
      @stop-agent="stopAgent"
      @stop-subagent="stopSubagent"
      @run-command="runCommand"
      @reload-command="reloadCommand"
      @stop-command="stopCommand"
      @reorder-terminal="reorderProjectTerminals"
      @reorder-command="reorderCommands"
      @start-terminal="startProjectTerminal"
      @edit-command="editCommand"
      @delete-command="deleteCommandFromMenu"
      @edit-agent="editAgentFromMenu"
      @delete-agent="deleteAgentFromMenu"
      @close="closeProjectTerminal"
      @set-terminal-title-override="setProjectTerminalTitle"
      @rename-modal-change="renameModalOpen = $event"
      @preview="openLeftTemporarily"
      @toggle="toggleLeftSidebar"
    />
    <div
      v-if="leftSidebarPresentation !== 'collapsed'"
      class="resize-handle left-resize"
      :class="{ 'overlay-resize': leftSidebarPresentation === 'overlay' }"
      title="Resize terminal sidebar"
      @pointerdown="startResize('left', $event)"
    />
    <TerminalPresentationShell
      ref="terminalPresentationShell"
      :selection="sidebarSelection"
      :selected-project="selectedProject"
      :projects="projects"
      :tabs="tabs"
      :main-terminal-id="mainTerminalId"
      :is-empty="isEmpty"
      :terminal-container-ref="terminalContainerRef"
      :subterminal-ids="subterminalIds"
      :terminal-family-id="terminalFamily?.rootTabId"
      :focused-terminal-id="activeTabId"
      :right-sidebar-open="effectiveRightSidebarOpen"
      :right-sidebar-mode="rightSidebarMode"
      :right-sidebar-modes="rightSidebarModes"
      :right-sidebar-presentation="rightSidebarPresentation"
      :right-sidebar-width="rightSidebarWidth"
      :show-right-sidebar="Boolean(selectedProject)"
      :selected-project-directory="selectedProject?.directory"
      :terminal-font-size="settings.terminalFontSize"
      :external-editor="selectedExternalEditor"
      @create="createProjectTerminal"
      @start-terminal="startProjectTerminal"
      @copy-terminal="copyProjectTerminal"
      @paste-terminal="pasteProjectTerminal"
      @close-terminal="closeProjectTerminal"
      @focus-terminal="focusFamilyTerminal"
      @host="attachHost"
      @select-project="selectProject"
      @add-project="addProject"
      @save-project="saveProjectMetadata"
      @remove-project="removeProject"
      @save-command="saveCommand"
      @remove-command="removeCommand"
      @save-agent="saveAgent"
      @remove-agent="removeAgent"
      @select-agent="selectAgentFromWorkspace"
      @run-agent="runAgent"
      @select-command="selectCommand"
      @edit-command="editCommand"
      @show-commands="showCommands"
      @show-agents="showAgents"
      @run-command="runCommand"
      @reload-command="reloadCommand"
      @stop-command="stopCommand"
      @select-right-mode="selectRightSidebarMode"
      @preview-right-mode="previewRightSidebarMode()"
      @collapse-right="closeRightSidebar()"
      @toggle-right="toggleRightSidebar"
      @resize-right="startResize('right', $event)"
      @maximize-terminal="maximizeTerminal"
      @terminal-layout="fitActiveTerminalAfterLayout"
      @git-available="gitSidebarAvailable = $event"
    />
    <KeyboardShortcutsView v-if="keyboardShortcutsOpen" @close="closeKeyboardShortcuts" />
    <ParentCloseDialog
      v-if="parentCloseChildCount !== undefined"
      :child-count="parentCloseChildCount"
      @choose="chooseParentClose"
    />
  </div>
</template>

<style>
:root {
  color: var(--color-text);
  background: transparent;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
.app-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.persistence-error {
  position: fixed;
  top: calc(var(--titlebar-height) + 0.5rem);
  left: 50%;
  z-index: 1000;
  display: flex;
  max-width: min(38rem, calc(100vw - 2rem));
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-status-error);
  border-radius: 0.5rem;
  color: var(--color-text-strong);
  background: var(--color-surface-raised);
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 30%);
  font-size: 0.75rem;
  transform: translateX(-50%);
}
.persistence-error button {
  flex: 0 0 auto;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: inherit;
  background: var(--color-surface-emphasis);
  cursor: pointer;
}
.app-toast {
  position: relative;
  z-index: 1000;
  width: max-content;
  max-width: calc(100% - 2rem);
  grid-column: 3;
  grid-row: 2;
  align-self: end;
  justify-self: center;
  margin-bottom: 1rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.5rem;
  color: var(--color-text-strong);
  background: var(--color-surface-raised);
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 30%);
  font-size: 0.75rem;
}
.app-toast-success {
  border-color: var(--color-border);
}
.app-toast-error {
  border-color: var(--color-status-error);
}
* {
  box-sizing: border-box;
}
*:focus,
*:focus-visible {
  outline: none !important;
}
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
button {
  font: inherit;
}
.app-shell {
  --left-sidebar-track: auto;
  --left-resize-track: 0.25rem;
  --right-resize-track: 0.25rem;
  --right-sidebar-track: auto;
  --workspace-footer-height: 2.5rem;
  --left-overlay-max-width: calc(100% - var(--sidebar-collapsed-width));
  --right-overlay-max-width: calc(100% - var(--sidebar-collapsed-width));
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns:
    var(--left-sidebar-track) var(--left-resize-track) minmax(0, 1fr)
    var(--right-resize-track) var(--right-sidebar-track);
  grid-template-rows: minmax(var(--titlebar-height), auto) minmax(0, 1fr);
  background: var(--color-app-bg);
  overflow: hidden;
}
/* Linux uses a transparent undecorated window so the compositor can show
   rounded corners around the application surface. */
.app-shell.linux {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 12px;
}
.app-shell
  :not(
    .terminal-shell,
    .terminal-shell *,
    input,
    textarea,
    [contenteditable="true"],
    [contenteditable="true"] *
  ) {
  -webkit-user-select: none;
  user-select: none;
}
.app-shell.without-right-sidebar {
  --right-resize-track: 0;
  --right-sidebar-track: 0;
  --left-overlay-max-width: 100%;
}
.app-shell.left-sidebar-overlay {
  --left-sidebar-track: var(--sidebar-collapsed-width);
}
.app-shell.left-sidebar-collapsed {
  --left-resize-track: 0;
}
.app-shell.right-sidebar-overlay {
  --right-sidebar-track: var(--sidebar-collapsed-width);
}
.app-shell.right-sidebar-collapsed {
  --right-resize-track: 0;
}
.app-shell::before,
.app-shell::after {
  z-index: 3;
  height: 0.125rem;
  grid-column: 3;
  grid-row: 2;
  margin-right: -0.125rem;
  background: var(--color-focus);
  content: "";
  opacity: 0;
  pointer-events: none;
}
.app-shell::before {
  align-self: start;
}
.app-shell::after {
  align-self: end;
  margin-bottom: var(--workspace-footer-height);
}
.app-shell:has(> .main-panel:focus-within)::before,
.app-shell:has(> .main-panel:focus-within)::after {
  opacity: 1;
}
.resize-handle {
  grid-row: 2;
  position: relative;
  width: 0.25rem;
  flex: 0 0 0.25rem;
  cursor: col-resize;
  touch-action: none;
  z-index: 2;
}
.app-shell > .sidebar {
  grid-column: 1;
  grid-row: 2;
}
.app-shell > .left-resize {
  grid-column: 2;
}
.app-shell > .right-resize {
  grid-column: 4;
}
.app-shell > .left-resize.overlay-resize,
.app-shell > .right-resize.overlay-resize {
  position: absolute;
  z-index: 31;
  top: 0;
  bottom: 0;
  grid-column: 1 / -1;
  transform: translateX(-50%);
}
.app-shell > .left-resize.overlay-resize {
  left: min(var(--left-sidebar-width), var(--left-overlay-max-width));
}
.app-shell > .right-resize.overlay-resize {
  right: min(var(--right-sidebar-width), var(--right-overlay-max-width));
  transform: translateX(50%);
}
.app-shell > .right-sidebar {
  grid-column: 5;
  grid-row: 2;
}
.resize-handle::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--color-border-muted);
  content: "";
  transform: translateX(-50%);
  transition: background 120ms ease;
}
.resize-handle:hover::after {
  background: var(--color-accent);
}
.app-shell > .sidebar.overlay,
.app-shell > .right-sidebar.overlay {
  position: absolute;
  z-index: 30;
  top: 0;
  bottom: 0;
  grid-column: 1 / -1;
  grid-row: 2;
}
.app-shell > .sidebar.overlay {
  left: 0;
  max-width: var(--left-overlay-max-width);
  border-right: 1px solid var(--color-border-muted);
  box-shadow: 0.75rem 0 2rem rgb(0 0 0 / 28%);
}
.app-shell > .right-sidebar.overlay {
  right: 0;
  max-width: var(--right-overlay-max-width);
  border-left: 1px solid var(--color-border-muted);
  box-shadow: -0.75rem 0 2rem rgb(0 0 0 / 28%);
}
@media (max-width: 56rem) {
  .app-shell {
    --left-resize-track: 0;
    --right-resize-track: 0;
  }
}
</style>
