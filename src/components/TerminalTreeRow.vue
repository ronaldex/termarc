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
  min-height: 34px;
  align-items: center;
  padding: 4px 0 4px var(--tree-item-icon-left, 21px);
  border-radius: 3px;
}
.process-row.tree-active::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: -13px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--color-focus);
  content: "";
}
.process-select {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 0;
  text-align: left;
}
.process-labels {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  padding-right: 0.5rem;
}
.process-title,
.process-labels small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.process-title {
  color: #c7c8cc;
  font-size: 12px;
}
.process-labels small {
  color: #696c73;
  font-size: 10px;
  font-weight: 400;
}
.path-label {
  direction: rtl;
  text-align: left;
}
.process-name-input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #555a64;
  outline: 0;
  color: #d8d9dc;
  background: transparent;
  font: inherit;
  font-size: 12px;
}
.shortcut {
  width: 20px;
  margin-left: auto;
  color: #575a61;
  font-size: 10px;
  text-align: center;
}
.close {
  position: absolute;
  right: 0;
  width: 20px;
  color: #6e7178;
  font-size: 15px;
  opacity: 0;
}
.process-row:hover .close {
  opacity: 1;
}
.process-row:hover .shortcut {
  opacity: 0;
}
</style>
