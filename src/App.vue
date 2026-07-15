<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { enableModernWindowStyle } from "@cloudworxx/tauri-plugin-mac-rounded-corners";
import AppTitlebar from "./components/AppTitlebar.vue";
import GitDiffViewer from "./components/GitDiffViewer.vue";
import ProjectManagerDialog from "./components/ProjectManagerDialog.vue";
import TerminalSidebar from "./components/TerminalSidebar.vue";
import WorkspaceMain from "./components/WorkspaceMain.vue";
import { useProjects } from "./composables/useProjects";
import { useTerminalTabs } from "./composables/useTerminalTabs";
import { useWorkspaceSelection } from "./composables/useWorkspaceSelection";
import type { SidebarSelection } from "./types/sidebar";

const {
  tabs,
  activeTabId,
  activeTab,
  isEmpty,
  createTab,
  selectTab,
  closeTab,
  restartTab,
  stopTab,
  clearActiveTab,
  setTerminalContainer,
  attachHost,
  setDefaultProject,
  start,
  dispose,
} = useTerminalTabs();
const leftSidebarOpen = ref(true);
const rightSidebarOpen = ref(true);
const gitSidebarAvailable = ref(true);
const leftSidebarWidth = ref(398);
const rightSidebarWidth = ref(320);
const {
  projects,
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
const projectManagerOpen = ref(false);
const managedProjectId = ref<string>();
function manageProjects(projectId?: string): void {
  managedProjectId.value = projectId;
  projectManagerOpen.value = true;
}
function addProject(): void {
  const project = addProjectState();
  selectProject(project);
  managedProjectId.value = project.id;
  projectManagerOpen.value = true;
}

function startResize(side: "left" | "right", event: PointerEvent): void {
  event.preventDefault();
  const initialX = event.clientX;
  const initialWidth = side === "left" ? leftSidebarWidth.value : rightSidebarWidth.value;

  const resize = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - initialX;
    const width = side === "left" ? initialWidth + delta : initialWidth - delta;
    if (side === "left") leftSidebarWidth.value = clamp(width, 180, 420);
    else rightSidebarWidth.value = clamp(width, 240, 620);
  };
  const stop = () => {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stop, { once: true });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

onMounted(async () => {
  void enableModernWindowStyle({ cornerRadius: 14, offsetX: -5, offsetY: -4 });
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
  () => selectedProject.value?.directory,
  () => {
    gitSidebarAvailable.value = true;
  },
);
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
onBeforeUnmount(dispose);
</script>

<template>
  <div class="app-shell" :class="{ 'without-git-sidebar': !gitSidebarAvailable }">
    <AppTitlebar
      :active-tab="activeTab"
      @clear="clearActiveTab"
      @restart="activeTab && restartTab(activeTab)"
      @stop="activeTab && stopTab(activeTab)"
    />
    <TerminalSidebar
      :class="{ 'sidebar-hidden': !leftSidebarOpen }"
      :style="{ width: `${leftSidebarOpen ? leftSidebarWidth : 48}px` }"
      :collapsed="!leftSidebarOpen"
      :tabs="tabs"
      :projects="projects"
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
    <ProjectManagerDialog
      v-if="projectManagerOpen"
      :projects="projects"
      :initial-project-id="managedProjectId"
      @close="projectManagerOpen = false"
      @add="addProject"
      @save="updateProject"
      @remove="removeProjectState"
    />
    <WorkspaceMain
      :selection="sidebarSelection"
      :selected-project="selectedProject"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :is-empty="isEmpty"
      :set-terminal-container="setTerminalContainer"
      @create="createProjectTerminal"
      @host="attachHost"
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
  color: #d8dee9;
  background: #0b0d12;
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
  background: #0b0d12;
  overflow: hidden;
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
  background: #10131a;
}
.right-rail-footer {
  display: flex;
  height: 38px;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #252a38;
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
