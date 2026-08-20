<script setup lang="ts">
import { computed, ref } from "vue";
import type { TerminalContextMenuRequest } from "../../types/contextMenu";
import type { SidebarSelection } from "../../types/sidebar";
import type { TerminalTabState } from "../../types/terminal";
import { terminalDisplayModel } from "../../utils/terminalLabels";
import SidebarTreeActionButton from "./SidebarTreeActionButton.vue";
import SidebarTreeItemRow from "./SidebarTreeItemRow.vue";
import TerminalStatusIndicator from "../terminal/TerminalStatusIndicator.vue";

const props = defineProps<{
  tab: TerminalTabState;
  shortcutNumber?: number;
  shortcutModifier: "meta" | "ctrl";
  modifierPressed: boolean;
  active: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  start: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
  focus: [selection: SidebarSelection];
}>();

const treeItemRow = ref<InstanceType<typeof SidebarTreeItemRow>>();
const display = computed(() => terminalDisplayModel(props.tab));
const shortcutNumber = computed(() => props.shortcutNumber);
const showsShortcut = computed(
  () => shortcutNumber.value !== undefined && shortcutNumber.value <= 9,
);
const shortcutGlyph = computed(() => (props.shortcutModifier === "ctrl" ? "⌃" : "⌘"));
const shortcutName = computed(() => (props.shortcutModifier === "ctrl" ? "Ctrl" : "Command"));
const shortcutVisible = computed(
  () => showsShortcut.value && props.modifierPressed && !props.collapsed,
);
const canRestart = computed(() => props.tab.status === "error");

function focus(): void {
  emit("focus", {
    id: props.tab.id,
    kind: "terminal",
    projectId: props.tab.projectId,
    tabId: props.tab.id,
  });
}
function requestContextMenu(x: number, y: number): void {
  const trigger = treeItemRow.value?.getSelectButton();
  if (trigger) emit("contextMenu", { kind: "terminal", tabId: props.tab.id, x, y, trigger });
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
    :title="collapsed ? display.tooltip : undefined"
    :aria-label="
      collapsed
        ? `${showsShortcut ? `${shortcutName}+${shortcutNumber}` : 'Terminal'}: ${display.primaryLabel}`
        : undefined
    "
    @select="focus"
    @double-click="emit('rename', tab.id)"
    @keydown="openContextMenuFromKeyboard"
    @context-menu="openContextMenu"
  >
    <template #icon>
      <TerminalStatusIndicator
        :status="tab.status"
        :busy="display.busy"
        :running="display.running"
        :title="display.tooltip"
      />
    </template>
    <template #content>
      <span class="process-labels">
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
    </template>
    <template #shortcut>{{ shortcutGlyph }}{{ shortcutNumber }}</template>
    <template #actions>
      <SidebarTreeActionButton
        v-if="tab.status === 'stopped' || canRestart"
        :title="canRestart ? 'Restart terminal' : 'Start terminal'"
        @click.stop="emit('start', tab.id)"
      >
        <svg v-if="canRestart" viewBox="0 0 16 16" aria-hidden="true">
          <path class="stroke-icon" d="M13 5V2.5L11.2 4.3A5 5 0 1 0 13 8" />
          <path class="stroke-icon" d="M10.5 2.5H13V5" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
        </svg>
      </SidebarTreeActionButton>
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
  color: var(--tree-row-primary-color);
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
</style>
