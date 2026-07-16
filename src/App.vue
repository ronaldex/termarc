<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { enableModernWindowStyle } from "@cloudworxx/tauri-plugin-mac-rounded-corners";
import AppTitlebar from "./components/AppTitlebar.vue";
import GitDiffViewer from "./components/GitDiffViewer.vue";
import TerminalSidebar from "./components/TerminalSidebar.vue";
import WorkspaceMain from "./components/WorkspaceMain.vue";
import { useProjects } from "./composables/useProjects";
import { useSidebarLayout } from "./composables/useSidebarLayout";
import { useTerminalTabs } from "./composables/useTerminalTabs";
import { useWorkspaceSelection } from "./composables/useWorkspaceSelection";
import { useAppSettings } from "./composables/useAppSettings";
import type { SidebarSelection } from "./types/sidebar";

const { load: loadAppSettings } = useAppSettings();

const {
  tabs,
  activeTabId,
  activeTab,
  isEmpty,
  createTab,
  selectTab,
  closeTab,
  setTerminalContainer,
  attachHost,
  setDefaultProject,
  start,
  dispose,
} = useTerminalTabs();
const gitSidebarAvailable = ref(true);
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
function focusSidebar(selection: SidebarSelection): void {
  setSidebarSelection(selection);
  const project = projects.value.find((item) => item.id === selection.projectId);
  if (project) setDefaultProject(project.id, project.directory);
  if (selection.tabId) activeTabId.value = selection.tabId;
}
function activateSidebar(selection: SidebarSelection): void {
  focusSidebar(selection);
  if (selection.kind === "terminal" && selection.tabId) selectTab(selection.tabId);
  if (selection.kind === "add-terminal" && selectedProject.value)
    void createProjectTerminal(selectedProject.value.id, selectedProject.value.directory);
}
async function createProjectTerminal(projectId: string, cwd: string): Promise<void> {
  const tab = await createTab(projectId, cwd);
  selectTerminal(projectId, tab.id);
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

function handleKeydown(event: KeyboardEvent) {
  if (event.metaKey && event.key === ",") {
    event.preventDefault();
    openSettings();
  }
}

onMounted(async () => {
  void enableModernWindowStyle({ cornerRadius: 14, offsetX: -5, offsetY: -4 });
  loadAppSettings();
  window.addEventListener("keydown", handleKeydown);
  try {
    await loadProjectConfiguration();
  } catch (error) {
    console.error("Could not load projects", error);
  }
  const initialProject = projects.value[0];
  selectProject(initialProject);
  start(initialProject.id, initialProject.directory);
});
watch(selectedProject, (project) => {
  gitSidebarAvailable.value = true;
  if (project) setDefaultProject(project.id, project.directory);
});
watch(activeTabId, (id) => {
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    const project = projects.value.find((item) => item.id === tab.projectId);
    if (project) selectTerminal(project.id, tab.id);
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
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  dispose();
});
</script>

<template>
  <div class="app-shell" :class="{ 'without-git-sidebar': !gitSidebarAvailable }">
    <AppTitlebar :active-tab="activeTab" />
    <TerminalSidebar
      :class="{ 'sidebar-hidden': !leftSidebarOpen }"
      :style="{ width: `${leftSidebarOpen ? leftSidebarWidth : 48}px` }"
      :collapsed="!leftSidebarOpen"
      :tabs="tabs"
      :projects="treeProjects"
      :selection="sidebarSelection"
      @focus="focusSidebar"
      @activate="activateSidebar"
      @add-project="addProject"
      @manage="manageProjects"
      @toggle-project="toggleProject"
      @toggle-terminals="toggleTerminals"
      @toggle-commands="toggleCommands"
      @close="closeTerminal"
      @toggle="leftSidebarOpen = !leftSidebarOpen"
    />
    <div
      v-if="leftSidebarOpen"
      class="resize-handle left-resize"
      title="Resize terminal sidebar"
      @pointerdown="startResize('left', $event)"
    />
    <WorkspaceMain
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
  grid-template-columns: auto 4px minmax(0, 1fr) 4px auto;
  grid-template-rows: 42px minmax(0, 1fr);
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
  grid-template-columns: auto 4px minmax(0, 1fr) 0 0;
}
.resize-handle {
  grid-row: 2;
  position: relative;
  width: 4px;
  flex: 0 0 4px;
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
  width: 48px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #20232d;
  background: var(--color-panel-bg);
}
.right-rail-footer {
  display: flex;
  height: 38px;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--color-border);
}
.right-rail button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  color: #696c73;
  background: transparent;
  cursor: pointer;
}
.right-rail button:hover {
  color: #c6c8cc;
}
.right-rail svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.resize-handle::after {
  position: absolute;
  inset: 0 1px;
  background: #20232d;
  content: "";
  transition: background 120ms ease;
}
.resize-handle:hover::after {
  background: #7aa2f7;
}
@media (max-width: 900px) {
  .right-resize,
  .diff-sidebar {
    display: none;
  }
}
@media (max-width: 720px) {
  .left-resize {
    display: none;
  }
}
</style>
