<script setup lang="ts">
import { computed, ref } from "vue";
import type { Project } from "../../types/project";
import type { SidebarSelection } from "../../types/sidebar";
import type { TerminalTab } from "../../types/terminal";
import ProjectManagementView from "../settings/views/ProjectManagementView.vue";
import ProjectSettingsView from "../settings/views/ProjectSettingsView.vue";
import AppSettingsView from "../settings/views/AppSettingsView.vue";
import CommandRunView from "./CommandRunView.vue";
import ProcessSettingsView from "../settings/views/ProcessSettingsView.vue";
import TerminalStoppedView from "../terminal/TerminalStoppedView.vue";
import TerminalSurface from "../terminal/TerminalSurface.vue";

const props = withDefaults(
  defineProps<{
    workspaceReady?: boolean;
    selection: SidebarSelection;
    selectedProject?: Project;
    projects: Project[];
    tabs: TerminalTab[];
    mainTerminalId?: string;
    isEmpty: boolean;
    terminalContainerRef: (tab: TerminalTab, ownerId: string) => (element: Element | null) => void;
  }>(),
  { workspaceReady: true },
);
const emit = defineEmits<{
  create: [projectId: string, directory: string];
  host: [element: HTMLElement];
  focusTerminal: [tabId: string];
  selectProject: [project: Project];
  addProject: [];
  saveProject: [project: Project];
  removeProject: [id: string];
  saveCommand: [project: Project, commandId: string];
  removeCommand: [project: Project, commandId: string];
  selectCommand: [projectId: string, commandId?: string];
  editCommand: [projectId: string, commandId: string];
  showCommands: [projectId: string];
  showAgents: [projectId: string];
  runCommand: [projectId: string, commandId: string];
  reloadCommand: [projectId: string, commandId: string];
  stopCommand: [projectId: string, commandId: string];
  saveAgent: [project: Project, agentId: string];
  removeAgent: [project: Project, agentId: string];
  selectAgent: [projectId: string, agentId?: string];
  runAgent: [projectId: string, agentId: string];
  startTerminal: [tabId: string];
  copyTerminal: [tabId: string];
  pasteTerminal: [tabId: string];
  closeTerminal: [tabId: string];
}>();

const selectedCommand = computed(() => {
  if (props.selection.kind !== "command" && props.selection.kind !== "edit-command") return;
  return props.selectedProject?.commands?.find(
    (command) => command.id === props.selection.commandId,
  );
});
const selectedAgent = computed(() => {
  if (props.selection.kind !== "agent" && props.selection.kind !== "edit-agent") return;
  return props.selectedProject?.agents?.find((agent) => agent.id === props.selection.commandId);
});
const agentTab = computed(() => {
  if (props.selection.kind !== "agent") return;
  return props.tabs.find(
    (tab) =>
      tab.projectId === props.selection.projectId &&
      tab.launch.kind === "command" &&
      tab.launch.source === "agent" &&
      tab.launch.commandId === props.selection.commandId,
  );
});
const mainTerminal = computed(() => props.tabs.find((tab) => tab.id === props.mainTerminalId));
const stoppedRun = computed(() => {
  if (props.selection.kind === "terminal" || props.selection.kind === "subagent") {
    const tab = mainTerminal.value;
    return tab?.launch.kind === "shell" && tab.status === "stopped"
      ? { tab, kind: "Terminal", heading: "Terminal is stopped", actionLabel: "Start terminal" }
      : undefined;
  }
  if (props.selection.kind === "agent") {
    const tab = agentTab.value;
    return tab?.status === "stopped"
      ? { tab, kind: "Agent", heading: "Agent is stopped", actionLabel: "Start agent" }
      : undefined;
  }
  // Completed commands retain their terminal so their output remains available for inspection.
});
const commandTab = computed(() => {
  if (props.selection.kind !== "command") return;
  return props.tabs.find(
    (tab) =>
      tab.projectId === props.selection.projectId &&
      tab.launch.kind === "command" &&
      (tab.launch.source ?? "command") === "command" &&
      tab.launch.commandId === props.selection.commandId,
  );
});

function createTerminal(): void {
  emit("create", props.selection.projectId, props.selectedProject?.directory ?? ".");
}

const mainPanel = ref<HTMLElement>();

function focusContent(): void {
  const panel = mainPanel.value;
  if (!panel) return;
  const action = panel.querySelector<HTMLElement>("button.primary");
  (action ?? panel).focus({ preventScroll: true });
}

function activateFocusedContent(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.target !== mainPanel.value) return;
  const action = mainPanel.value?.querySelector<HTMLButtonElement>("button.primary");
  if (!action) return;
  event.preventDefault();
  action.click();
}

function startStoppedRun(): void {
  const run = stoppedRun.value;
  if (!run) return;
  if (run.tab.launch.kind === "shell") emit("startTerminal", run.tab.id);
  else if (run.tab.launch.source === "agent")
    emit("runAgent", run.tab.projectId, run.tab.launch.commandId);
  else emit("runCommand", run.tab.projectId, run.tab.launch.commandId);
}

function hasContentFocus(): boolean {
  return Boolean(mainPanel.value?.contains(document.activeElement));
}

function saveCommand(project: Project, commandId: string): void {
  emit("saveCommand", project, commandId);
}

defineExpose({ focusContent, hasContentFocus });
</script>

<template>
  <main
    ref="mainPanel"
    class="main-panel"
    tabindex="-1"
    aria-label="Workspace content"
    @keydown="activateFocusedContent"
  >
    <template v-if="workspaceReady">
      <TerminalSurface
        v-show="
          ((selection.kind === 'terminal' || selection.kind === 'subagent') && !stoppedRun) ||
          (selection.kind === 'command' && commandTab && !stoppedRun) ||
          (selection.kind === 'agent' && agentTab && !stoppedRun)
        "
        :tabs="tabs"
        :main-terminal-id="mainTerminalId"
        :is-empty="isEmpty"
        :terminal-container-ref="terminalContainerRef"
        @create="createTerminal"
        @host="emit('host', $event)"
        @focus="emit('focusTerminal', $event)"
        @copy="emit('copyTerminal', $event)"
        @paste="emit('pasteTerminal', $event)"
        @close="emit('closeTerminal', $event)"
      />
      <TerminalStoppedView
        v-if="stoppedRun && selectedProject"
        :project="selectedProject"
        :kind="stoppedRun.kind"
        :heading="stoppedRun.heading"
        :action-label="stoppedRun.actionLabel"
        @start="startStoppedRun"
      />
      <ProjectManagementView
        v-else-if="selection.kind === 'projects'"
        :projects="projects"
        @select="emit('selectProject', $event)"
        @add="emit('addProject')"
      />
      <ProjectSettingsView
        v-else-if="
          (selection.kind === 'project' ||
            selection.kind === 'commands' ||
            selection.kind === 'agents') &&
          selectedProject
        "
        :project="selectedProject"
        @save="emit('saveProject', $event)"
        @remove="emit('removeProject', $event)"
        @add-command="emit('selectCommand', selectedProject.id)"
        @add-agent="emit('selectAgent', selectedProject.id)"
        @edit-agent="emit('selectAgent', selectedProject.id, $event)"
        @edit-command="emit('editCommand', selectedProject.id, $event)"
        @remove-command="emit('removeCommand', selectedProject, $event)"
        @remove-agent="emit('removeAgent', selectedProject, $event)"
      />
      <AppSettingsView v-else-if="selection.kind === 'app-settings'" />
      <CommandRunView
        v-else-if="selection.kind === 'agent' && selectedProject && selectedAgent && !agentTab"
        :project="selectedProject"
        :command="selectedAgent"
        @run="emit('runAgent', selectedProject.id, selectedAgent.id)"
      />
      <CommandRunView
        v-else-if="
          selection.kind === 'command' && selectedProject && selectedCommand && !commandTab
        "
        :project="selectedProject"
        :command="selectedCommand"
        @run="emit('runCommand', selectedProject.id, selectedCommand.id)"
      />
      <ProcessSettingsView
        v-else-if="
          (selection.kind === 'add-agent' || selection.kind === 'edit-agent') && selectedProject
        "
        :key="selection.id"
        :project="selectedProject"
        category="agent"
        :command="selectedAgent"
        @save="(project, id) => emit('saveAgent', project, id)"
        @remove="(project, id) => emit('removeAgent', project, id)"
        @cancel="emit('showAgents', selectedProject.id)"
      />
      <ProcessSettingsView
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
        v-else-if="
          selection.kind !== 'terminal' &&
          selection.kind !== 'subagent' &&
          !(selection.kind === 'command' && commandTab && !stoppedRun) &&
          !(selection.kind === 'agent' && agentTab && !stoppedRun)
        "
        class="main-stub"
      >
        <span class="stub-icon">{{ selection.kind.includes("command") ? "▱" : "▣" }}</span>
        <h2 v-if="selection.kind === 'terminals'">Terminals</h2>
        <h2 v-else-if="selection.kind === 'add-terminal'">Open a new terminal</h2>
        <h2 v-else>Workspace</h2>
        <p v-if="selection.kind === 'terminals'">
          Select a terminal or create a new one for this project.
        </p>
        <p v-else-if="selection.kind === 'add-terminal'">
          Terminal configuration will appear here.
        </p>
        <p v-else>Select an item from the project tree.</p>
      </section>
    </template>
    <div v-else class="startup-blank" aria-hidden="true"></div>
    <footer class="workspace-footer" aria-hidden="true"></footer>
  </main>
</template>

<style scoped>
.main-panel {
  position: relative;
  display: grid;
  grid-column: 3;
  grid-row: 2;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr) var(--workspace-footer-height, 2.5rem);
  background: var(--color-app-bg);
}
.main-panel > :not(.workspace-footer) {
  min-height: 0;
  grid-column: 1;
  grid-row: 1;
}
.main-panel > .terminal-shell {
  min-height: 0;
  height: 100%;
}
.workspace-footer {
  min-width: 0;
  grid-column: 1;
  grid-row: 2;
  border-top: 1px solid var(--color-border);
  background: var(--panel-footer-background);
}
.main-stub {
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 2.5rem;
  color: var(--color-text-subtle);
  text-align: center;
  background: var(--color-app-bg);
}
.stub-icon {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  margin-bottom: 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
}
h2 {
  margin: 0 0 0.5rem;
  color: var(--color-text);
  font-size: 1rem;
}
p {
  margin: 0;
  font-size: 0.75rem;
}
</style>
