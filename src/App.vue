<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadProjects, saveProjects } from "./api/projects";
import { enableModernWindowStyle } from "@cloudworxx/tauri-plugin-mac-rounded-corners";
import GitDiffViewer from "./components/GitDiffViewer.vue";
import TerminalSidebar from "./components/TerminalSidebar.vue";
import TerminalSurface from "./components/TerminalSurface.vue";
import { useTerminalTabs } from "./composables/useTerminalTabs";
import type { Project } from "./types/project";
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
  statusLabel,
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
const projects = ref<Project[]>([
  {
    id: "project-1",
    name: "Current project",
    directory: ".",
    terminalOpen: true,
    commandsOpen: true,
  },
]);
const sidebarSelection = ref<SidebarSelection>({
  id: "project-1",
  kind: "project",
  projectId: "project-1",
});
const selectedProject = computed(() =>
  projects.value.find((project) => project.id === sidebarSelection.value.projectId),
);
function focusSidebar(selection: SidebarSelection): void {
  sidebarSelection.value = selection;
  activeProjectId.value = selection.projectId;
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
  focusSidebar({
    id: tab.id,
    kind: "terminal",
    projectId,
    tabId: tab.id,
  });
}
async function closeTerminal(id: string): Promise<void> {
  if (sidebarSelection.value.tabId === id) {
    const projectId = sidebarSelection.value.projectId;
    sidebarSelection.value = { id: `${projectId}:terminals`, kind: "terminals", projectId };
  }
  await closeTab(id);
}
const projectManagerOpen = ref(false);
const editingProject = ref<Project | null>(null);
function manageProjects(): void {
  projectManagerOpen.value = true;
  editingProject.value = null;
}
function editProject(project: Project): void {
  editingProject.value = { ...project };
}
function saveProject(): void {
  if (!editingProject.value) return;
  const index = projects.value.findIndex((p) => p.id === editingProject.value!.id);
  if (index >= 0) projects.value[index] = { ...editingProject.value };
  editingProject.value = null;
}
function removeProject(id: string): void {
  if (projects.value.length === 1) return;
  projects.value = projects.value.filter((p) => p.id !== id);
  if (activeProjectId.value === id) activeProjectId.value = projects.value[0].id;
}
const activeProjectId = ref("project-1");
function addProject(): void {
  const id = `project-${Date.now()}`;
  const project: Project = {
    id,
    name: "New project",
    directory: ".",
    terminalOpen: true,
    commandsOpen: true,
  };
  projects.value.push(project);
  activeProjectId.value = id;
  projectManagerOpen.value = true;
  editingProject.value = { ...project };
}
function toggleProject(id: string): void {
  const project = projects.value.find((p) => p.id === id);
  if (project) {
    project.terminalOpen = !project.terminalOpen;
    project.commandsOpen = project.terminalOpen;
    activeProjectId.value = id;
  }
}
function toggleTerminals(id: string): void {
  const project = projects.value.find((p) => p.id === id);
  if (project) project.terminalOpen = !project.terminalOpen;
}
function toggleCommands(id: string): void {
  const project = projects.value.find((p) => p.id === id);
  if (project) project.commandsOpen = !project.commandsOpen;
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

let projectsLoaded = false;
onMounted(async () => {
  void enableModernWindowStyle({ cornerRadius: 14, offsetX: -5, offsetY: -4 });
  try {
    const saved = await loadProjects();
    if (saved.length) {
      projects.value = saved;
      activeProjectId.value = saved[0].id;
      sidebarSelection.value = { id: saved[0].id, kind: "project", projectId: saved[0].id };
    }
  } catch (error) {
    console.error("Could not load projects", error);
  }
  projectsLoaded = true;
  const initialProject =
    projects.value.find((p) => p.id === activeProjectId.value) ?? projects.value[0];
  start(initialProject.id, initialProject.directory);
});
watch(
  () => selectedProject.value?.directory,
  () => {
    gitSidebarAvailable.value = true;
  },
);
watch(
  projects,
  (value) => {
    if (projectsLoaded) void saveProjects(value).catch(console.error);
  },
  { deep: true },
);
watch(activeTabId, (id) => {
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    const project = projects.value.find((item) => item.id === tab.projectId);
    if (project)
      sidebarSelection.value = {
        id: tab.id,
        kind: "terminal",
        projectId: project.id,
        tabId: tab.id,
      };
  }
});
watch(
  () => tabs.map((tab) => tab.id),
  (ids) => {
    const selected = sidebarSelection.value;
    if (selected.kind === "terminal" && selected.tabId && !ids.includes(selected.tabId)) {
      sidebarSelection.value = {
        id: `${selected.projectId}:terminals`,
        kind: "terminals",
        projectId: selected.projectId,
      };
    }
  },
);
onBeforeUnmount(dispose);
</script>

<template>
  <div class="app-shell" :class="{ 'without-git-sidebar': !gitSidebarAvailable }">
    <header class="titlebar" data-tauri-drag-region>
      <span class="app-title">Termdeck</span>
      <div class="active-terminal" data-tauri-drag-region>
        <span class="title-dot" :class="activeTab?.status ?? 'stopped'" />
        <strong>{{ activeTab?.title ?? "No terminal" }}</strong>
        <span>{{ activeTab?.detail ?? "Create a terminal to begin" }}</span>
      </div>
      <div class="terminal-actions">
        <button :disabled="!activeTab" @click="clearActiveTab">Clear</button>
        <button
          :disabled="!activeTab || activeTab.status === 'starting'"
          @click="activeTab && restartTab(activeTab)"
        >
          Restart
        </button>
        <button
          :disabled="!activeTab?.session || activeTab.status === 'starting'"
          @click="activeTab && stopTab(activeTab)"
        >
          Stop
        </button>
      </div>
    </header>
    <TerminalSidebar
      :class="{ 'sidebar-hidden': !leftSidebarOpen }"
      :style="{ width: `${leftSidebarOpen ? leftSidebarWidth : 48}px` }"
      :collapsed="!leftSidebarOpen"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :status-label="statusLabel"
      :projects="projects"
      :active-project-id="activeProjectId"
      :selection="sidebarSelection"
      @focus="focusSidebar"
      @activate="activateSidebar"
      @create="
        (cwd) =>
          createProjectTerminal(
            activeProjectId,
            cwd ?? projects.find((p) => p.id === activeProjectId)?.directory ?? '.',
          )
      "
      @add-project="addProject"
      @manage="manageProjects"
      @toggle-project="toggleProject"
      @toggle-terminals="toggleTerminals"
      @toggle-commands="toggleCommands"
      @select="selectTab"
      @close="closeTerminal"
      @toggle="leftSidebarOpen = !leftSidebarOpen"
    />
    <div
      v-if="leftSidebarOpen"
      class="resize-handle left-resize"
      title="Resize terminal sidebar"
      @pointerdown="startResize('left', $event)"
    />
    <div v-if="projectManagerOpen" class="modal-backdrop" @click.self="projectManagerOpen = false">
      <section class="project-manager">
        <header>
          <strong>Manage projects</strong><button @click="projectManagerOpen = false">×</button>
        </header>
        <div class="manager-body">
          <div class="project-picker">
            <button
              v-for="project in projects"
              :key="project.id"
              :class="{ selected: editingProject?.id === project.id }"
              @click="editProject(project)"
            >
              {{ project.name }}<small>{{ project.directory }}</small></button
            ><button class="add-project" @click="addProject">＋ Add project</button>
          </div>
          <form v-if="editingProject" @submit.prevent="saveProject">
            <label>Name<input v-model="editingProject.name" required /></label
            ><label>Directory<input v-model="editingProject.directory" required /></label>
            <div class="form-actions">
              <button
                type="button"
                class="danger"
                @click="
                  removeProject(editingProject.id);
                  editingProject = null;
                "
              >
                Delete</button
              ><button type="submit">Save</button>
            </div>
          </form>
          <p v-else class="empty-manager">Select a project to edit its settings.</p>
        </div>
      </section>
    </div>
    <main class="main-panel">
      <TerminalSurface
        v-show="sidebarSelection.kind === 'terminal'"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :is-empty="isEmpty"
        :set-terminal-container="setTerminalContainer"
        @create="
          createProjectTerminal(
            activeProjectId,
            projects.find((project) => project.id === activeProjectId)?.directory ?? '.',
          )
        "
        @host="attachHost"
      />
      <section v-if="sidebarSelection.kind !== 'terminal'" class="main-stub">
        <span class="stub-icon">{{
          sidebarSelection.kind === "project"
            ? "◆"
            : sidebarSelection.kind.includes("command")
              ? "▱"
              : "▣"
        }}</span>
        <h2 v-if="sidebarSelection.kind === 'project'">{{ selectedProject?.name }} settings</h2>
        <h2 v-else-if="sidebarSelection.kind === 'terminals'">Terminals</h2>
        <h2 v-else-if="sidebarSelection.kind === 'add-terminal'">Open a new terminal</h2>
        <h2 v-else-if="sidebarSelection.kind === 'commands'">Commands</h2>
        <h2 v-else>Add a command</h2>
        <p v-if="sidebarSelection.kind === 'project'">
          Project settings for {{ selectedProject?.directory }}
        </p>
        <p v-else-if="sidebarSelection.kind === 'terminals'">
          Select a terminal or create a new one for this project.
        </p>
        <p v-else-if="sidebarSelection.kind === 'add-terminal'">
          Terminal configuration will appear here.
        </p>
        <p v-else-if="sidebarSelection.kind === 'commands'">
          Manage the commands configured for this project.
        </p>
        <p v-else>Command configuration will appear here.</p>
      </section>
    </main>
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
.titlebar {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 22px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid #252a38;
  color: #b8c0d2;
  background: #12151d;
  user-select: none;
}
.app-title {
  margin-left: 72px;
  color: #eef2fa;
  font-size: 12px;
  font-weight: 700;
}
.active-terminal {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.active-terminal span:last-child {
  overflow: hidden;
  color: #778196;
  font-family: monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #687087;
}
.title-dot.running {
  background: #9ece6a;
}
.title-dot.starting {
  background: #e0af68;
}
.title-dot.error {
  background: #f7768e;
}
.terminal-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.terminal-actions button {
  padding: 5px 10px;
  border: 1px solid #303645;
  border-radius: 6px;
  color: #b8c0d2;
  background: #1a1e28;
  font-size: 10px;
  cursor: pointer;
}
.terminal-actions button:hover:not(:disabled) {
  background: #242a38;
  color: #fff;
}
.terminal-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}
.modal-backdrop {
  position: fixed;
  inset: 42px 0 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: #0008;
}
.project-manager {
  width: min(650px, 90vw);
  border: 1px solid #303645;
  border-radius: 12px;
  color: #d8dee9;
  background: #151923;
  box-shadow: 0 20px 60px #0009;
}
.project-manager header {
  display: flex;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #2a3040;
}
.project-manager header button {
  border: 0;
  color: #aeb7ca;
  background: none;
  font-size: 20px;
  cursor: pointer;
}
.manager-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 280px;
}
.project-picker {
  padding: 12px;
  border-right: 1px solid #2a3040;
}
.project-picker button {
  display: block;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 7px;
  color: #b8c0d2;
  background: none;
  text-align: left;
  cursor: pointer;
}
.project-picker button:hover,
.project-picker .selected {
  background: #242a38;
  color: #fff;
}
.project-picker small {
  display: block;
  overflow: hidden;
  color: #737c91;
  font-size: 10px;
  text-overflow: ellipsis;
}
.project-picker .add-project {
  margin-top: 10px;
  color: #8be9fd;
}
.project-manager form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
}
.project-manager label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8993a9;
  font-size: 11px;
}
.project-manager input {
  padding: 9px;
  border: 1px solid #303645;
  border-radius: 6px;
  color: #eef2fa;
  background: #0e1117;
}
.form-actions {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
}
.form-actions button {
  padding: 8px 14px;
  border: 1px solid #3b4660;
  border-radius: 6px;
  color: #e6eaf2;
  background: #293149;
  cursor: pointer;
}
.form-actions .danger {
  color: #f7768e;
  background: #321f28;
}
.empty-manager {
  padding: 22px;
  color: #737c91;
  font-size: 12px;
}
.main-panel {
  display: grid;
  grid-column: 3;
  grid-row: 2;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr);
  background: #0b0d12;
}
.main-panel > .terminal-shell {
  min-height: 0;
  height: 100%;
}
.main-stub {
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 40px;
  color: #747e93;
  text-align: center;
  background: #0b0d12;
}
.main-stub .stub-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  margin-bottom: 14px;
  border: 1px solid #2d3446;
  border-radius: 10px;
  color: #8b9cc8;
  background: #141824;
}
.main-stub h2 {
  margin: 0 0 7px;
  color: #d8dee9;
  font-size: 16px;
}
.main-stub p {
  margin: 0;
  font-size: 12px;
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
