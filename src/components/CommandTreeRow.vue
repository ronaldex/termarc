<script setup lang="ts">
import { computed, ref } from "vue";
import type { CommandContextMenuRequest } from "../types/contextMenu";
import type { ProjectCommand } from "../types/project";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import SidebarTreeActionButton from "./SidebarTreeActionButton.vue";
import SidebarTreeItemRow from "./SidebarTreeItemRow.vue";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{
  projectId: string;
  command: ProjectCommand;
  tab?: TerminalTabState;
  shortcutModifier: "meta" | "ctrl";
  modifierPressed: boolean;
  shortcutNumber?: number;
  active: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  contextMenu: [request: CommandContextMenuRequest];
  focus: [selection: SidebarSelection];
  activate: [selection: SidebarSelection];
  run: [projectId: string, commandId: string];
  reload: [projectId: string, commandId: string];
  stop: [projectId: string, commandId: string];
}>();

const treeItemRow = ref<InstanceType<typeof SidebarTreeItemRow>>();
const running = computed(() => props.tab?.status === "starting" || props.tab?.status === "running");
const shortcutGlyph = computed(() => (props.shortcutModifier === "ctrl" ? "⌃" : "⌘"));
const shortcutName = computed(() => (props.shortcutModifier === "ctrl" ? "Ctrl" : "Command"));
const showsShortcut = computed(
  () => props.shortcutNumber !== undefined && props.shortcutNumber <= 9,
);
const shortcutVisible = computed(
  () => showsShortcut.value && props.modifierPressed && !props.collapsed,
);
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
function requestContextMenu(x: number, y: number): void {
  const trigger = treeItemRow.value?.getSelectButton();
  if (!trigger) return;
  emit("contextMenu", {
    kind: "command",
    projectId: props.projectId,
    commandId: props.command.id,
    x,
    y,
    trigger,
  });
}
function openContextMenu(event: MouseEvent): void {
  requestContextMenu(event.clientX, event.clientY);
}
function openContextMenuFromKeyboard(event: KeyboardEvent): void {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  event.preventDefault();
  const bounds = treeItemRow.value?.getSelectButton()?.getBoundingClientRect();
  if (bounds) requestContextMenu(bounds.left + 12, bounds.bottom - 4);
}
</script>

<template>
  <SidebarTreeItemRow
    ref="treeItemRow"
    :active="active"
    :collapsed="collapsed"
    :shortcut-visible="shortcutVisible"
    custom-context-menu
    :title="collapsed ? `${command.name}: ${command.command}` : undefined"
    :aria-label="
      collapsed
        ? `${showsShortcut ? `${shortcutName}+${shortcutNumber}` : 'Command'}: ${command.name}`
        : undefined
    "
    @select="select"
    @keydown="openContextMenuFromKeyboard"
    @context-menu="openContextMenu"
  >
    <template #icon>
      <TerminalStatusIndicator
        v-if="tab"
        :status="tab.status"
        :running="tab.status === 'running'"
      />
      <span v-else class="command-icon">›_</span>
    </template>
    <template #content>
      <span class="command-labels">
        <strong>{{ command.name }}</strong>
        <small :title="command.command">{{ command.command }}</small>
      </span>
    </template>
    <template #shortcut>{{ shortcutGlyph }}{{ shortcutNumber }}</template>
    <template #actions>
      <span class="command-actions">
        <SidebarTreeActionButton
          :title="`${running ? 'Restart' : 'Start'} command`"
          @click="runOrReload"
        >
          <svg v-if="running" viewBox="0 0 16 16" aria-hidden="true">
            <path class="stroke-icon" d="M13 5V2.5L11.2 4.3A5 5 0 1 0 13 8" />
            <path class="stroke-icon" d="M10.5 2.5H13V5" />
          </svg>
          <svg v-else viewBox="0 0 16 16" aria-hidden="true">
            <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
          </svg>
        </SidebarTreeActionButton>
        <SidebarTreeActionButton
          v-if="running"
          title="Stop command"
          variant="danger"
          @click="emit('stop', projectId, command.id)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect class="fill-icon" x="4" y="4" width="8" height="8" rx="1" />
          </svg>
        </SidebarTreeActionButton>
      </span>
    </template>
  </SidebarTreeItemRow>
</template>

<style scoped>
button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.command-icon {
  color: var(--color-text-subtle);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5rem;
  line-height: 1;
}
.command-labels {
  display: flex;
  min-width: 0;
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
  color: var(--tree-row-primary-color);
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
  justify-content: flex-end;
  gap: 0.25rem;
}
</style>
