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
import { useAppSettings } from "./composables/useAppSettings";
import { useCommandRuns } from "./composables/useCommandRuns";
import { applyAppTheme } from "./themes/themeCatalog";
import type { Project } from "./types/project";

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
  setDefaultProject,
  isTerminalFocused,
  start,
  dispose,
} = useTerminalTabs();
const commandRuns = useCommandRuns({ tabs, createTab, restartTab, stopTab, closeTab });
const terminalSidebar = ref<InstanceType<typeof TerminalSidebar>>();
const workspaceMain = ref<InstanceType<typeof WorkspaceMain>>();
const gitSidebarAvailable = ref(true);
const lastProjectId = ref<string>();
const {
  leftOpen: leftSidebarOpen,
  rightOpen: rightSidebarOpen,
  leftWidth: leftSidebarWidth,
  rightWidth: rightSidebarWidth,
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
  selectTerminalSection,
  openSettings,
} = useWorkspaceSelection(projects);
const { focusSidebar, activateSidebar } = useSidebarActivation({
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
async function createProjectTerminal(projectId: string, cwd: string): Promise<void> {
  const tab = await createTab(projectId, cwd);
  selectTerminal(projectId, tab.id);
  selectTab(tab.id);
}
async function closeTerminal(id: string): Promise<void> {
  if (sidebarSelection.value.tabId === id) selectTerminalSection(sidebarSelection.value.projectId);
  await closeTab(id);
}
function manageProjects(projectId?: string): void {
  const project = projects.value.find((item) => item.id === projectId);
  if (project) selectProject(project);
  else {
    const projectId = selectedProject.value?.id ?? projects.value[0].id;
    setSidebarSelection({ id: "projects", kind: "projects", projectId });
  }
}
function addProject(): void {
  selectProject(addProjectState());
}
function selectCommand(projectId: string, commandId?: string): void {
  setSidebarSelection(
    commandId
      ? {
          id: `${projectId}:command:${commandId}`,
          kind: "command",
          projectId,
          commandId,
        }
      : { id: `${projectId}:add-command`, kind: "add-command", projectId },
  );
}
function editCommand(projectId: string, commandId: string): void {
  setSidebarSelection({
    id: `${projectId}:command:${commandId}:settings`,
    kind: "edit-command",
    projectId,
    commandId,
  });
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
  setSidebarSelection({ id: `${projectId}:commands`, kind: "commands", projectId });
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
  leftSidebarOpen,
  rightSidebarOpen,
  gitSidebarAvailable,
  selection: sidebarSelection,
  projects,
  lastProjectId,
  isTerminalFocused,
  selectProject,
  openSettings,
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
watch(
  () => tabs.map((tab) => tab.id),
  (ids) => {
    const selected = sidebarSelection.value;
    if (selected.kind === "terminal" && selected.tabId && !ids.includes(selected.tabId)) {
      selectTerminalSection(selected.projectId);
    }
  },
);
onBeforeUnmount(dispose);
</script>

<template>
  <div class="app-shell" :class="{ 'without-git-sidebar': !gitSidebarAvailable }">
    <AppTitlebar :active-tab="activeTab" />
    <TerminalSidebar
      ref="terminalSidebar"
      :class="{ 'sidebar-hidden': !leftSidebarOpen }"
      :style="{ width: `${leftSidebarOpen ? leftSidebarWidth : 48}px` }"
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
      @toggle="leftSidebarOpen = !leftSidebarOpen"
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
    <aside v-if="!rightSidebarOpen && gitSidebarAvailable" class="right-rail">
      <div class="right-rail-footer">
        <button title="Show Git changes" @click="rightSidebarOpen = true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg>
        </button>
      </div>
    </aside>
    <GitDiffViewer
      v-if="gitSidebarAvailable"
      v-show="rightSidebarOpen"
      :style="{ width: `${rightSidebarWidth}px` }"
      :directory="selectedProject?.directory"
      :active="rightSidebarOpen"
      :font-size="settings.terminalFontSize"
      @available="gitSidebarAvailable = $event"
      @collapse="rightSidebarOpen = false"
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
.right-rail {
  grid-column: 5;
  grid-row: 2;
  width: 3rem;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border-muted);
  background: var(--color-panel-bg);
}
.right-rail-footer {
  display: flex;
  height: 2.5rem;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--color-border);
}
.right-rail button {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 0;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
}
.right-rail button:hover {
  color: var(--color-text);
}
.right-rail svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.resize-handle::after {
  position: absolute;
  inset: 0 0.0625rem;
  background: var(--color-border-muted);
  content: "";
  transition: background 120ms ease;
}
.resize-handle:hover::after {
  background: var(--color-accent);
}
@media (max-width: 56rem) {
  .right-resize,
  .diff-sidebar {
    display: none;
  }
}
@media (max-width: 45rem) {
  .left-resize {
    display: none;
  }
}
</style>
