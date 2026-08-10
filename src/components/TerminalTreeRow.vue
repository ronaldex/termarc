<script setup lang="ts">
import { computed, ref } from "vue";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalDisplayModel } from "../utils/terminalLabels";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

export type TerminalContextMenuRequest = {
  tabId: string;
  x: number;
  y: number;
  trigger: HTMLButtonElement;
};

const props = defineProps<{
  tab: TerminalTabState;
  active: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  close: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
  focus: [selection: SidebarSelection];
}>();

const terminalButton = ref<HTMLButtonElement>();
const display = computed(() => terminalDisplayModel(props.tab));
const shortcutNumber = computed(() => props.tab.shortcutNumber ?? props.tab.number);
const showsShortcut = computed(() => shortcutNumber.value <= 9);

function focus(): void {
  emit("focus", {
    id: props.tab.id,
    kind: "terminal",
    projectId: props.tab.projectId,
    tabId: props.tab.id,
  });
}
function requestContextMenu(x: number, y: number): void {
  const trigger = terminalButton.value;
  if (trigger) emit("contextMenu", { tabId: props.tab.id, x, y, trigger });
}
function openContextMenu(event: MouseEvent): void {
  requestContextMenu(event.clientX, event.clientY);
}
function openContextMenuFromKeyboard(event: KeyboardEvent): void {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  event.preventDefault();
  const bounds = terminalButton.value?.getBoundingClientRect();
  if (bounds) requestContextMenu(bounds.left + 12, bounds.bottom - 4);
}
</script>

<template>
  <div
    class="process-row"
    :class="{ 'tree-active': active, compact: collapsed }"
    @contextmenu.prevent="openContextMenu"
  >
    <button
      ref="terminalButton"
      class="process-select"
      :title="collapsed ? display.tooltip : undefined"
      :aria-label="
        collapsed
          ? `${showsShortcut ? `Terminal ${shortcutNumber}` : 'Terminal'}: ${display.primaryLabel}`
          : undefined
      "
      @click="focus"
      @dblclick.stop="emit('rename', tab.id)"
      @keydown="openContextMenuFromKeyboard"
    >
      <TerminalStatusIndicator
        :status="tab.status"
        :busy="display.busy"
        :running="display.running"
        :title="display.tooltip"
      />
      <span v-if="!collapsed" class="process-labels">
        <span
          class="process-title"
          :class="{ 'path-label': display.primaryIsPath }"
          :title="display.primaryLabel"
        >
          {{ display.primaryLabel }}
        </span>
        <small
          v-if="display.secondaryLabel"
          :class="{ 'path-label': display.secondaryIsPath }"
          :title="display.tooltip"
        >
          {{ display.secondaryLabel }}
        </small>
      </span>
      <span v-if="showsShortcut && !collapsed" class="shortcut">⌘{{ shortcutNumber }}</span>
    </button>
    <button
      v-if="!collapsed"
      class="close"
      title="Close terminal"
      aria-label="Close terminal"
      @click.stop="emit('close', tab.id)"
    >
      ×
    </button>
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
.process-row {
  position: relative;
  display: flex;
  height: 2.3125rem;
  min-height: 2.3125rem;
  align-items: center;
  padding: 0.25rem 0 0.25rem var(--tree-item-icon-left, 1.25rem);
  border-radius: 0.25rem;
}
.process-row.tree-active::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: -0.875rem;
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.process-select {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: var(--tree-icon-column) minmax(0, 1fr) var(--tree-action-column);
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0;
  text-align: left;
}
.process-labels {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.125rem;
}
.process-title,
.process-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.process-title {
  color: var(--color-text-strong);
  font-size: 0.75rem;
}
.process-labels small {
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 400;
}
.path-label {
  direction: rtl;
  text-align: left;
}
.shortcut {
  width: 100%;
  color: var(--color-text-faint);
  font-size: 0.625rem;
  text-align: right;
}
.close {
  position: absolute;
  right: 0;
  width: 1.25rem;
  color: var(--color-text-subtle);
  font-size: 0.9375rem;
  opacity: 0;
}
.process-row:hover .close {
  opacity: 1;
}
.process-row:not(.compact):hover .shortcut {
  opacity: 0;
}
.process-row.compact {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}
.process-row.compact .process-select {
  display: flex;
  flex: 0 0 auto;
}
.process-row.compact.tree-active::before {
  left: 0;
}
</style>
