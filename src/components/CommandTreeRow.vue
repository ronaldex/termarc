<script setup lang="ts">
import { computed } from "vue";
import type { ProjectCommand } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{
  projectId: string;
  command: ProjectCommand;
  tab?: TerminalTabState;
  active: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
  run: [projectId: string, commandId: string];
  reload: [projectId: string, commandId: string];
  stop: [projectId: string, commandId: string];
}>();

const running = computed(() => props.tab?.status === "starting" || props.tab?.status === "running");
const selection = computed<SidebarSelection>(() => ({
  id: `${props.projectId}:command:${props.command.id}`,
  kind: "command",
  projectId: props.projectId,
  commandId: props.command.id,
}));

function select(): void {
  emit(props.collapsed ? "activate" : "focus", selection.value);
}
function runOrReload(): void {
  emit(running.value ? "reload" : "run", props.projectId, props.command.id);
}
</script>

<template>
  <div class="command-row" :class="{ 'tree-active': active, compact: collapsed }">
    <button
      class="command-select"
      :title="collapsed ? `${command.name}: ${command.command}` : undefined"
      :aria-label="collapsed ? command.name : undefined"
      @click="select"
    >
      <TerminalStatusIndicator
        v-if="tab"
        :status="tab.status"
        :running="tab.status === 'running'"
      />
      <span v-else class="command-icon">›_</span>
      <span v-if="!collapsed" class="command-labels">
        <strong>{{ command.name }}</strong>
        <small :title="command.command">{{ command.command }}</small>
      </span>
    </button>
    <span v-if="!collapsed" class="command-actions">
      <button
        :title="`${running ? 'Restart' : 'Start'} command`"
        :aria-label="`${running ? 'Restart' : 'Start'} command`"
        @click="runOrReload"
      >
        <svg v-if="running" viewBox="0 0 16 16" aria-hidden="true">
          <path class="stroke-icon" d="M13 5V2.5L11.2 4.3A5 5 0 1 0 13 8" />
          <path class="stroke-icon" d="M10.5 2.5H13V5" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
        </svg>
      </button>
      <button
        v-if="running"
        class="stop-command"
        title="Stop command"
        aria-label="Stop command"
        @click="emit('stop', projectId, command.id)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect class="fill-icon" x="4" y="4" width="8" height="8" rx="1" />
        </svg>
      </button>
    </span>
  </div>
</template>

<style scoped>
button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.command-row {
  position: relative;
  display: flex;
  width: calc(100% - var(--tree-item-icon-left));
  min-height: 2.25rem;
  align-items: center;
  gap: 0.5rem;
  margin-left: var(--tree-item-icon-left);
  padding: 0.25rem 0;
  color: var(--color-text-subtle);
  font-size: 0.6875rem;
}
.command-row.tree-active::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: calc(-1 * var(--tree-item-icon-left) - 0.875rem);
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.command-row:hover {
  color: var(--color-text);
}
.command-select {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: var(--tree-icon-column) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0;
  text-align: left;
}
.command-icon {
  display: grid;
  width: var(--tree-item-icon-size);
  height: var(--tree-item-icon-size);
  flex: 0 0 var(--tree-item-icon-size);
  place-items: center;
  color: var(--color-text-subtle);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5rem;
  line-height: 1;
}
.command-labels {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
}
.command-labels strong,
.command-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-labels strong {
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 400;
}
.command-labels small {
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 400;
}
.command-actions {
  display: flex;
  min-width: var(--tree-action-column);
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 0.25rem;
}
.command-actions button {
  display: grid;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-emphasis);
  font-size: 0.5625rem;
}
.command-actions button:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
.command-actions svg {
  width: 0.75rem;
  height: 0.75rem;
}
.command-actions .stroke-icon {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.command-actions .fill-icon {
  fill: currentColor;
}
.command-actions .stop-command {
  color: var(--color-status-error);
}
.command-row.compact {
  width: 100%;
  margin-left: 0;
}
.command-row.compact .command-select {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 100%;
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}
.command-row.compact.tree-active::before {
  left: 0;
}
</style>
