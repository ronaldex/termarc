<script setup lang="ts">
import type { Project } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTab } from "../types/terminal";
import TerminalSurface from "./TerminalSurface.vue";

const props = defineProps<{
  selection: SidebarSelection;
  selectedProject?: Project;
  tabs: TerminalTab[];
  activeTabId?: string;
  isEmpty: boolean;
  setTerminalContainer: (tab: TerminalTab, element: Element | null) => void;
}>();
const emit = defineEmits<{
  create: [projectId: string, directory: string];
  host: [element: HTMLElement];
}>();

function createTerminal(): void {
  emit("create", props.selection.projectId, props.selectedProject?.directory ?? ".");
}
</script>

<template>
  <main class="main-panel">
    <TerminalSurface
      v-show="selection.kind === 'terminal'"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :is-empty="isEmpty"
      :set-terminal-container="setTerminalContainer"
      @create="createTerminal"
      @host="emit('host', $event)"
    />
    <section v-if="selection.kind !== 'terminal'" class="main-stub">
      <span class="stub-icon">{{
        selection.kind === "project" ? "◆" : selection.kind.includes("command") ? "▱" : "▣"
      }}</span>
      <h2 v-if="selection.kind === 'project'">{{ selectedProject?.name }} settings</h2>
      <h2 v-else-if="selection.kind === 'terminals'">Terminals</h2>
      <h2 v-else-if="selection.kind === 'add-terminal'">Open a new terminal</h2>
      <h2 v-else-if="selection.kind === 'commands'">Commands</h2>
      <h2 v-else>Add a command</h2>
      <p v-if="selection.kind === 'project'">
        Project settings for {{ selectedProject?.directory }}
      </p>
      <p v-else-if="selection.kind === 'terminals'">
        Select a terminal or create a new one for this project.
      </p>
      <p v-else-if="selection.kind === 'add-terminal'">Terminal configuration will appear here.</p>
      <p v-else-if="selection.kind === 'commands'">
        Manage the commands configured for this project.
      </p>
      <p v-else>Command configuration will appear here.</p>
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
  color: #d8dee9;
  font-size: 16px;
}
p {
  margin: 0;
  font-size: 12px;
}
</style>
