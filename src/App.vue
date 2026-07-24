<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { enableModernWindowStyle } from "@cloudworxx/tauri-plugin-mac-rounded-corners";
import AppTitlebar from "./components/AppTitlebar.vue";
import GitDiffViewer from "./components/GitDiffViewer.vue";
import TerminalSidebar from "./components/TerminalSidebar.vue";
import WorkspaceMain from "./components/WorkspaceMain.vue";
import { useProjects } from "./composables/useProjects";
import { useSidebarActivation } from "./composables/useSidebarActivation";
import { useSidebarLayout } from "./composables/useSidebarLayout";
import { useTerminalTabs } from "./composables/useTerminalTabs";
import { useWorkspaceSelection } from "./composables/useWorkspaceSelection";
import { useWorkspaceShortcuts } from "./composables/useWorkspaceShortcuts";
import { useWorkspaceTerminalNavigation } from "./composables/useWorkspaceTerminalNavigation";
import { useAppSettings } from "./composables/useAppSettings";
import { useCommandRuns } from "./composables/useCommandRuns";
import { applyAppTheme } from "./themes/themeCatalog";
import type { Project } from "./types/project";
import type { SidebarSelection } from "./types/sidebar";

const { settings, load: loadAppSettings } = useAppSettings();

const {
  tabs,
  activeTabId,
  activeTab,
  isEmpty,
  createTab,
  selectTab,
  closeTab,
  renameTab,
  restartTab,
  stopTab,
  setTerminalContainer,
  attachHost,
  fitActiveTerminalAfterLayout,
  setDefaultProject,
  isTerminalFocused,
  start,
  dispose,
} = useTerminalTabs();
const commandRuns = useCommandRuns({ tabs, createTab, restartTab, stopTab, closeTab });
const terminalSidebar = ref<InstanceType<typeof TerminalSidebar>>();
const workspaceMain = ref<InstanceType<typeof WorkspaceMain>>();
const gitSidebar = ref<InstanceType<typeof GitDiffViewer>>();
const gitSidebarAvailable = ref(true);
const lastProjectId = ref<string>();
const {
  leftOpen: leftSidebarOpen,
  rightOpen: rightSidebarOpen,
  leftWidth: leftSidebarWidth,
  rightWidth: rightSidebarWidth,
  openLeftTemporarily,
  restoreLeftPreference,
  toggleLeft,
  expandRight,
  openRightTemporarily,
  restoreRightPreference,
  toggleRight,
  closeRight,
  startResize,
} = useSidebarLayout();
const {
  projects,
  treeProjects,
  load: loadProjectConfiguration,
  add: addProjectState,
  update: updateProject,
  remove: removeProjectState,
  toggleProject,
  toggleTerminals,
  toggleCommands,
} = useProjects();
const {
  selection: sidebarSelection,
  selectedProject,
  focus: setSidebarSelection,
  selectProject,
  selectTerminal,
  selectAddTerminal,
  selectCommands,
  selectCommand: selectCommandSelection,
  selectAddCommand,
  selectEditCommand,
  selectProjectManagement,
  openSettings,
} = useWorkspaceSelection(projects);
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
  createProjectTerminal: (projectId, directory) => void createProjectTerminal(projectId, directory),
});
function activateSidebar(selection: SidebarSelection): void {
  activateSidebarSelection(selection);
  restoreLeftPreference();
}
const { cycleTerminal: cycleSidebarTerminal, closeTerminal } = useWorkspaceTerminalNavigation({
  tabs,
  selection: sidebarSelection,
  focusSidebar,
  selectTerminal,
  selectAddTerminal,
  closeTab,
  focusSidebarTree: () => terminalSidebar.value?.focusTree(),
});

async function createProjectTerminal(projectId: string, cwd: string): Promise<void> {
  const tab = await createTab(projectId, cwd);
  selectTerminal(projectId, tab.id);
  selectTab(tab.id);
}
function manageProjects(projectId?: string): void {
  const project = projects.value.find((item) => item.id === projectId);
  if (project) selectProject(project);
  else selectProjectManagement(selectedProject.value?.id ?? projects.value[0].id);
}
function addProject(): void {
  selectProject(addProjectState());
}
function selectCommand(projectId: string, commandId?: string): void {
  if (commandId) selectCommandSelection(projectId, commandId);
  else selectAddCommand(projectId);
}
function editCommand(projectId: string, commandId: string): void {
  selectEditCommand(projectId, commandId);
}
async function runCommand(projectId: string, commandId: string): Promise<void> {
  const project = projects.value.find((item) => item.id === projectId);
  const command = project?.commands?.find((item) => item.id === commandId);
  if (!project || !command) return;
  const tab = await commandRuns.run(project, command);
  activeTabId.value = tab.id;
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
function saveCommand(project: Project, commandId: string): void {
  updateProject(project);
  selectCommand(project.id, commandId);
}
async function removeCommand(project: Project, commandId: string): Promise<void> {
  await commandRuns.remove(project.id, commandId);
  updateProject(project);
  showCommands(project.id);
}

useWorkspaceShortcuts({
  sidebar: terminalSidebar,
  workspace: workspaceMain,
  gitSidebar,
  openLeftSidebar: openLeftTemporarily,
  restoreLeftSidebar: restoreLeftPreference,
  openRightSidebar: openRightTemporarily,
  restoreRightSidebar: restoreRightPreference,
  toggleRightSidebar: toggleRight,
  closeRightSidebar: closeRight,
  gitSidebarAvailable,
  selection: sidebarSelection,
  projects,
  lastProjectId,
  isTerminalFocused,
  selectProject,
  openSettings,
  cycleTerminal: cycleSidebarTerminal,
  shouldActivateSidebar(selection) {
    return (
      selection.kind === "terminal" ||
      (selection.kind === "command" &&
        Boolean(commandRuns.find(selection.projectId, selection.commandId)))
    );
  },
  activateSidebar,
});

onMounted(async () => {
  void enableModernWindowStyle({ cornerRadius: 14, offsetX: -5, offsetY: -4 });
  loadAppSettings();
  try {
    await loadProjectConfiguration();
  } catch (error) {
    console.error("Could not load projects", error);
  }
  const initialProject = projects.value[0];
  selectProject(initialProject);
  start(initialProject.id, initialProject.directory);
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
  gitSidebarAvailable.value = true;
  if (project) {
    lastProjectId.value = project.id;
    setDefaultProject(project.id, project.directory);
  }
});
watch(activeTabId, (id) => {
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    const project = projects.value.find((item) => item.id === tab.projectId);
    if (!project) return;
    if (tab.launch.kind === "command") selectCommand(project.id, tab.launch.commandId);
    else selectTerminal(project.id, tab.id);
  }
});
watch([leftSidebarOpen, rightSidebarOpen], fitActiveTerminalAfterLayout, { flush: "post" });
onBeforeUnmount(dispose);
</script>

<template>
  <div class="app-shell" :class="{ 'without-git-sidebar': !gitSidebarAvailable }">
    <AppTitlebar :active-tab="activeTab" />
    <TerminalSidebar
      ref="terminalSidebar"
      :class="{ 'sidebar-hidden': !leftSidebarOpen }"
      :style="{
        width: leftSidebarOpen ? `${leftSidebarWidth}px` : 'var(--sidebar-collapsed-width)',
      }"
      :collapsed="!leftSidebarOpen"
      :tabs="tabs"
      :projects="treeProjects"
      :selection="sidebarSelection"
      :is-terminal-focused="isTerminalFocused"
      @focus="focusSidebar"
      @activate="activateSidebar"
      @add-project="addProject"
      @manage="manageProjects"
      @toggle-project="toggleProject"
      @toggle-terminals="toggleTerminals"
      @toggle-commands="toggleCommands"
      @run-command="runCommand"
      @reload-command="reloadCommand"
      @stop-command="stopCommand"
      @close="closeTerminal"
      @rename="renameTab"
      @toggle="toggleLeft"
    />
    <div
      v-if="leftSidebarOpen"
      class="resize-handle left-resize"
      title="Resize terminal sidebar"
      @pointerdown="startResize('left', $event)"
    />
    <WorkspaceMain
      ref="workspaceMain"
      :selection="sidebarSelection"
      :selected-project="selectedProject"
      :projects="projects"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :is-empty="isEmpty"
      :set-terminal-container="setTerminalContainer"
      @create="createProjectTerminal"
      @host="attachHost"
      @select-project="selectProject"
      @add-project="addProject"
      @save-project="updateProject"
      @remove-project="removeProjectState"
      @save-command="saveCommand"
      @remove-command="removeCommand"
      @select-command="selectCommand"
      @edit-command="editCommand"
      @show-commands="showCommands"
      @run-command="runCommand"
      @reload-command="reloadCommand"
      @stop-command="stopCommand"
    />
    <div
      v-if="rightSidebarOpen && gitSidebarAvailable"
      class="resize-handle right-resize"
      title="Resize Git changes sidebar"
      @pointerdown="startResize('right', $event)"
    />
    <GitDiffViewer
      v-if="gitSidebarAvailable"
      ref="gitSidebar"
      :style="{
        width: rightSidebarOpen ? `${rightSidebarWidth}px` : 'var(--sidebar-collapsed-width)',
      }"
      :directory="selectedProject?.directory"
      :active="rightSidebarOpen"
      :font-size="settings.terminalFontSize"
      @available="gitSidebarAvailable = $event"
      @collapse="closeRight"
      @expand="expandRight"
    />
  </div>
</template>

<style>
:root {
  color: var(--color-text);
  background: var(--color-app-bg);
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
* {
  box-sizing: border-box;
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
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: auto 0.25rem minmax(0, 1fr) 0.25rem auto;
  grid-template-rows: minmax(42px, auto) minmax(0, 1fr);
  background: var(--color-app-bg);
  overflow: hidden;
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
.app-shell.without-git-sidebar {
  grid-template-columns: auto 0.25rem minmax(0, 1fr) 0 0;
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
.app-shell > .diff-sidebar {
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
@media (max-width: 56rem) {
  .app-shell,
  .app-shell.without-git-sidebar {
    grid-template-columns: auto 0 minmax(0, 1fr) 0 auto;
  }
  .left-resize,
  .right-resize {
    display: none;
  }
  .app-shell > .sidebar:not(.collapsed),
  .app-shell > .diff-sidebar:not(.collapsed) {
    position: absolute;
    z-index: 30;
    top: 0;
    bottom: 0;
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .app-shell > .sidebar:not(.collapsed) {
    left: 0;
    width: min(20rem, calc(100% - var(--sidebar-collapsed-width))) !important;
    border-right: 1px solid var(--color-border-muted);
    box-shadow: 0.75rem 0 2rem rgb(0 0 0 / 28%);
  }
  .app-shell.without-git-sidebar > .sidebar:not(.collapsed) {
    width: min(20rem, 100%) !important;
  }
  .app-shell > .diff-sidebar:not(.collapsed) {
    right: 0;
    width: min(30rem, calc(100% - var(--sidebar-collapsed-width))) !important;
    border-left: 1px solid var(--color-border-muted);
    box-shadow: -0.75rem 0 2rem rgb(0 0 0 / 28%);
  }
}
</style>
