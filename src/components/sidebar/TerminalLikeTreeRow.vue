<script setup lang="ts">
import { computed, ref } from "vue";
import type { TerminalContextMenuRequest } from "../../types/contextMenu";
import type { SidebarSelection } from "../../types/sidebar";
import type { TerminalTabState } from "../../types/terminal";
import SidebarTreeActionButton from "./SidebarTreeActionButton.vue";
import SidebarTreeItemRow from "./SidebarTreeItemRow.vue";
import TerminalStatusIndicator from "../terminal/TerminalStatusIndicator.vue";

const props = defineProps<{
  tab: TerminalTabState;
  selection?: Extract<SidebarSelection, { kind: "terminal" | "subagent" }>;
  shortcutNumber?: number;
  shortcutModifier: "meta" | "ctrl";
  modifierPressed: boolean;
  active: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  activate: [selection: SidebarSelection];
  stop: [id: string];
  close: [id: string];
  start: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
}>();

const treeItemRow = ref<InstanceType<typeof SidebarTreeItemRow>>();
const launch = computed(() => props.tab.launch);
const isSubagent = computed(() => launch.value.kind === "subagent");
const label = computed(
  () =>
    props.tab.customTitle ||
    (launch.value.kind === "subagent"
      ? launch.value.name
      : props.tab.launchTitle || props.tab.terminalTitle || props.tab.title),
);
const activeProcess = computed(
  () => props.tab.status === "starting" || props.tab.status === "running",
);
const statusLabel = computed(() => {
  if (props.tab.agent === "pi" && props.tab.agentState) return `Pi ${props.tab.agentState}`;
  if (props.tab.status === "starting") return "Starting";
  if (props.tab.status === "running") return props.tab.processName || "Running";
  if (props.tab.status === "error") return "Error";
  return "Stopped";
});
const showsShortcut = computed(
  () => props.shortcutNumber !== undefined && props.shortcutNumber <= 9,
);
const shortcutVisible = computed(
  () => showsShortcut.value && props.modifierPressed && !props.collapsed,
);
const shortcutGlyph = computed(() => (props.shortcutModifier === "ctrl" ? "⌃" : "⌘"));
const shortcutName = computed(() => (props.shortcutModifier === "ctrl" ? "Ctrl" : "Command"));

function activate(): void {
  if (props.selection) {
    emit("activate", props.selection);
  } else if (launch.value.kind === "subagent") {
    emit("activate", {
      id: props.tab.id,
      kind: "subagent",
      projectId: props.tab.projectId,
      tabId: props.tab.id,
      parentTerminalId: launch.value.parentTerminalId,
    });
  } else {
    emit("activate", {
      id: props.tab.id,
      kind: "terminal",
      projectId: props.tab.projectId,
      tabId: props.tab.id,
    });
  }
}
function rename(): void {
  emit("rename", props.tab.id);
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
    nested
    :shortcut-visible="shortcutVisible"
    custom-context-menu
    :title="collapsed ? `${label}: ${statusLabel}` : undefined"
    :aria-label="
      collapsed
        ? `${showsShortcut ? `${shortcutName}+${shortcutNumber}` : isSubagent ? 'Subagent' : 'Terminal'}: ${label}, ${statusLabel}`
        : undefined
    "
    @select="activate"
    @double-click="rename"
    @keydown="openContextMenuFromKeyboard"
    @context-menu="openContextMenu"
  >
    <template #icon>
      <span class="subagent-icon" :class="{ compact: collapsed }">
        <svg
          class="subagent-branch"
          :class="{ compact: collapsed }"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path :d="collapsed ? 'M3 2v8h3' : 'M3 2v8h10'" />
        </svg>
        <TerminalStatusIndicator
          :class="{ 'compact-status': collapsed }"
          :status="tab.status"
          :busy="tab.agentState === 'processing'"
          :running="Boolean(tab.processName)"
          :title="statusLabel"
        />
      </span>
    </template>
    <template #content>
      <span class="subagent-labels">
        <strong :title="label">{{ label }}</strong>
        <small :title="tab.detail">{{ statusLabel }}</small>
      </span>
    </template>
    <template #shortcut>{{ shortcutGlyph }}{{ shortcutNumber }}</template>
    <template #actions>
      <SidebarTreeActionButton
        v-if="isSubagent && activeProcess"
        title="Stop subagent"
        variant="danger"
        @click.stop="emit('stop', tab.id)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect class="fill-icon" x="4" y="4" width="8" height="8" rx="1" />
        </svg>
      </SidebarTreeActionButton>
      <SidebarTreeActionButton
        v-else-if="isSubagent"
        title="Close subagent"
        variant="danger"
        @click.stop="emit('close', tab.id)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path class="stroke-icon" d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </SidebarTreeActionButton>
      <SidebarTreeActionButton
        v-else-if="tab.status === 'stopped' || tab.status === 'error'"
        title="Start terminal"
        @click.stop="emit('start', tab.id)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path class="fill-icon" d="M5 3.5v9l7-4.5z" />
        </svg>
      </SidebarTreeActionButton>
    </template>
  </SidebarTreeItemRow>
</template>

<style scoped>
.subagent-icon {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
}
.subagent-branch {
  position: absolute;
  right: calc(100% + 0.4375rem);
  width: 0.875rem;
  height: 0.875rem;
  overflow: visible;
  transform: translateY(-0.125rem);
  fill: none;
  stroke: var(--color-text-faint);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
}
.subagent-icon.compact {
  transform: translateX(3px);
}
.subagent-branch.compact {
  right: auto;
  left: 50%;
  width: 0.625rem;
  height: 0.625rem;
  transform: translate(-50%, -0.125rem);
  stroke-linecap: butt;
  stroke-width: 1.5;
}
.compact-status {
  z-index: 1;
  transform: translate(0.1875rem, -1px);
}
.subagent-labels {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.125rem;
}
.subagent-labels strong,
.subagent-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subagent-labels strong {
  color: var(--tree-row-primary-color);
  font-size: 0.75rem;
  font-weight: 400;
}
.subagent-labels small {
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  font-weight: 400;
}
</style>
