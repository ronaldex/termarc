<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { SidebarSelection } from "../types/sidebar";
import type { TerminalTabState } from "../types/terminal";
import { terminalDisplayModel } from "../utils/terminalLabels";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{
  tab: TerminalTabState;
  active: boolean;
}>();
const emit = defineEmits<{
  close: [id: string];
  rename: [id: string, name: string];
  focus: [selection: SidebarSelection];
}>();

const editing = ref(false);
const editedName = ref("");
const renameInput = ref<HTMLInputElement>();
const display = computed(() => terminalDisplayModel(props.tab));

function focus(): void {
  emit("focus", {
    id: props.tab.id,
    kind: "terminal",
    projectId: props.tab.projectId,
    tabId: props.tab.id,
  });
}
function beginRename(): void {
  editing.value = true;
  editedName.value = props.tab.name ?? "";
  void nextTick(() => renameInput.value?.select());
}
function finishRename(): void {
  if (!editing.value) return;
  editing.value = false;
  emit("rename", props.tab.id, editedName.value);
}
function cancelRename(): void {
  editing.value = false;
}
</script>

<template>
  <div class="process-row" :class="{ 'tree-active': active }">
    <button
      class="process-select"
      title="Double-click to name terminal"
      @click="focus"
      @dblclick.stop="beginRename"
    >
      <TerminalStatusIndicator
        :status="tab.status"
        :busy="display.busy"
        :running="display.running"
        :title="display.tooltip"
      />
      <span v-if="editing" class="process-labels">
        <input
          ref="renameInput"
          v-model="editedName"
          class="process-name-input"
          aria-label="Terminal name"
          placeholder="Terminal name"
          @click.stop
          @dblclick.stop
          @keydown.enter.prevent="finishRename"
          @keydown.escape.prevent="cancelRename"
          @blur="finishRename"
        />
      </span>
      <span v-else class="process-labels">
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
    </button>
    <span class="shortcut">⌘{{ tab.number }}</span>
    <button class="close" title="Close terminal" @click="emit('close', tab.id)">×</button>
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
  min-height: 2.25rem;
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
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding: 0;
  text-align: left;
}
.process-labels {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  padding-right: 0.5rem;
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
.process-name-input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border-strong);
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 0.75rem;
}
.shortcut {
  width: 1.25rem;
  margin-left: auto;
  color: var(--color-text-faint);
  font-size: 0.625rem;
  text-align: center;
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
.process-row:hover .shortcut {
  opacity: 0;
}
</style>
