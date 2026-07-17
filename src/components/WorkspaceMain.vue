<script setup lang="ts">
import { computed } from "vue";
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import ProjectManagementView from "./ProjectManagementView.vue";
import ProjectSettingsView from "./ProjectSettingsView.vue";
import AppSettingsView from "./AppSettingsView.vue";
import CommandRunView from "./CommandRunView.vue";
import CommandSettingsView from "./CommandSettingsView.vue";
import TerminalSurface from "./TerminalSurface.vue";

const props = defineProps<{
  selection: SidebarSelection;
  selectedProject?: Project;
  projects: Project[];
  tabs: TerminalTab[];
  activeTabId?: string;
  isEmpty: boolean;
  setTerminalContainer: (tab: TerminalTab, element: Element | null) => void;
}>();
const emit = defineEmits<{
  create: [projectId: string, directory: string];
  host: [element: HTMLElement];
  selectProject: [project: Project];
  addProject: [];
  saveProject: [project: Project];
  removeProject: [id: string];
  saveCommand: [project: Project, commandId: string];
  removeCommand: [project: Project, commandId: string];
  selectCommand: [projectId: string, commandId?: string];
  editCommand: [projectId: string, commandId: string];
  showCommands: [projectId: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
}>();

const selectedCommand = computed(() => {
  if (props.selection.kind !== "command" && props.selection.kind !== "edit-command") return;
  return props.selectedProject?.commands?.find(
    (command) => command.id === props.selection.commandId,
  );
});
const commandTab = computed(() => {
  if (props.selection.kind !== "command") return;
  return props.tabs.find(
    (tab) =>
      tab.projectId === props.selection.projectId &&
      tab.launch.kind === "command" &&
      tab.launch.commandId === props.selection.commandId,
  );
});

function createTerminal(): void {
  emit("create", props.selection.projectId, props.selectedProject?.directory ?? ".");
}

function saveCommand(project: Project, commandId: string): void {
  emit("saveCommand", project, commandId);
}
</script>

<template>
  <main class="main-panel">
    <TerminalSurface
      v-show="selection.kind === 'terminal' || (selection.kind === 'command' && commandTab)"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :is-empty="isEmpty"
      :set-terminal-container="setTerminalContainer"
      @create="createTerminal"
      @host="emit('host', $event)"
    />
    <ProjectManagementView
      v-if="selection.kind === 'projects'"
      :projects="projects"
      @select="emit('selectProject', $event)"
      @add="emit('addProject')"
    />
    <ProjectSettingsView
      v-else-if="(selection.kind === 'project' || selection.kind === 'commands') && selectedProject"
      :project="selectedProject"
      @save="emit('saveProject', $event)"
      @remove="emit('removeProject', $event)"
      @add-command="emit('selectCommand', selectedProject.id)"
      @edit-command="emit('editCommand', selectedProject.id, $event)"
    />
    <AppSettingsView v-else-if="selection.kind === 'app-settings'" />
    <CommandRunView
      v-else-if="selection.kind === 'command' && selectedProject && selectedCommand && !commandTab"
      :project="selectedProject"
      :command="selectedCommand"
      @run="emit('runCommand', selectedProject.id, selectedCommand.id)"
    />
    <CommandSettingsView
      v-else-if="
        (selection.kind === 'add-command' || selection.kind === 'edit-command') && selectedProject
      "
      :key="selection.id"
      :project="selectedProject"
      :command="selectedCommand"
      @save="saveCommand"
      @remove="(project, commandId) => emit('removeCommand', project, commandId)"
      @cancel="emit('showCommands', selectedProject.id)"
    />
    <section
      v-else-if="selection.kind !== 'terminal' && !(selection.kind === 'command' && commandTab)"
      class="main-stub"
    >
      <span class="stub-icon">{{ selection.kind.includes("command") ? "▱" : "▣" }}</span>
      <h2 v-if="selection.kind === 'terminals'">Terminals</h2>
      <h2 v-else-if="selection.kind === 'add-terminal'">Open a new terminal</h2>
      <h2 v-else>Workspace</h2>
      <p v-if="selection.kind === 'terminals'">
        Select a terminal or create a new one for this project.
      </p>
      <p v-else-if="selection.kind === 'add-terminal'">Terminal configuration will appear here.</p>
      <p v-else>Select an item from the project tree.</p>
    </section>
  </main>
</template>

<style scoped>
.main-panel {
  display: grid;
  grid-column: 3;
  grid-row: 2;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr);
  background: var(--color-app-bg);
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
  background: var(--color-app-bg);
}
.stub-icon {
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
h2 {
  margin: 0 0 7px;
  color: var(--color-text);
  font-size: 16px;
}
p {
  margin: 0;
  font-size: 12px;
}
</style>
