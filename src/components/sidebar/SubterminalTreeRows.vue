<script setup lang="ts">
import type { TerminalContextMenuRequest } from "../../types/contextMenu";
import type { SidebarSelection } from "../../types/sidebar";
import type { ProjectTreeTerminalItem } from "../../utils/projectTreeModel";
import TerminalLikeTreeRow from "./TerminalLikeTreeRow.vue";

const props = defineProps<{
  items: ProjectTreeTerminalItem[];
  shortcutNumbers: Map<string, number>;
  shortcutModifier: "meta" | "ctrl";
  modifierPressed: boolean;
  selectedId: string;
  collapsed?: boolean;
}>();
const emit = defineEmits<{
  register: [element: Element | null, id: string];
  focus: [selection: SidebarSelection];
  start: [id: string];
  stop: [id: string];
  close: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
}>();
</script>

<template>
  <div
    v-for="item in items"
    :key="item.id"
    :ref="(element) => emit('register', element, item.id)"
    class="terminal-like-row"
    @pointerdown.stop
  >
    <TerminalLikeTreeRow
      :tab="item.tab"
      :selection="item.selection"
      :shortcut-number="shortcutNumbers.get(`${item.selection.kind}:${item.tab.id}`)"
      :shortcut-modifier="shortcutModifier"
      :modifier-pressed="modifierPressed"
      :active="selectedId === item.id"
      :collapsed="collapsed"
      @activate="emit('focus', $event)"
      @start="emit('start', $event)"
      @stop="emit('stop', $event)"
      @close="emit('close', $event)"
      @rename="emit('rename', $event)"
      @context-menu="emit('contextMenu', $event)"
    />
  </div>
</template>

<style scoped>
.terminal-like-row {
  width: 100%;
}
</style>
