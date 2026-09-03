<script setup lang="ts">
import type { TerminalContextMenuRequest } from "../../types/contextMenu";
import type { SidebarSelection } from "../../types/sidebar";
import type { ProjectTreeTerminalItem } from "../../utils/projectTreeModel";
import type { SortItem } from "../../composables/useProjectTreeSorting";
import TerminalLikeTreeRow from "./TerminalLikeTreeRow.vue";

const props = defineProps<{
  items: ProjectTreeTerminalItem[];
  shortcutNumbers: Map<string, number>;
  shortcutModifier: "meta" | "ctrl";
  modifierPressed: boolean;
  selectedId: string;
  collapsed?: boolean;
  sortableProjectId?: string;
  dropClass?: (item: SortItem) => Record<string, boolean>;
}>();
const emit = defineEmits<{
  register: [element: Element | null, id: string];
  focus: [selection: SidebarSelection];
  start: [id: string];
  stop: [id: string];
  close: [id: string];
  rename: [id: string];
  contextMenu: [request: TerminalContextMenuRequest];
  beginSort: [event: PointerEvent, item: SortItem];
  moveSort: [event: KeyboardEvent, item: SortItem, label: string];
}>();
</script>

<template>
  <div
    v-for="item in items"
    :key="item.id"
    :ref="(element) => emit('register', element, item.id)"
    class="terminal-like-row"
    :class="
      sortableProjectId && dropClass
        ? dropClass({ kind: 'terminal', projectId: sortableProjectId, id: item.id })
        : undefined
    "
    :data-sort-kind="sortableProjectId ? 'terminal' : undefined"
    :data-project-id="sortableProjectId"
    :data-sort-id="sortableProjectId ? item.id : undefined"
    :data-sort-parent-id="sortableProjectId ? item.parentId : undefined"
    @pointerdown.stop="
      sortableProjectId &&
      emit('beginSort', $event, { kind: 'terminal', projectId: sortableProjectId, id: item.id })
    "
    @keydown="
      sortableProjectId &&
      emit(
        'moveSort',
        $event,
        { kind: 'terminal', projectId: sortableProjectId, id: item.id },
        item.tab.customTitle || item.tab.title,
      )
    "
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
  position: relative;
  width: 100%;
}
.terminal-like-row[data-sort-kind] {
  cursor: grab;
}
.terminal-like-row[data-sort-kind]:active {
  cursor: grabbing;
}
.terminal-like-row.dragging {
  opacity: 0.55;
}
.terminal-like-row.drop-before::before,
.terminal-like-row.drop-after::after {
  position: absolute;
  right: 0;
  left: calc(var(--tree-item-icon-left) + var(--tree-icon-column));
  z-index: 2;
  height: 0.125rem;
  border-radius: 0.125rem;
  background: var(--color-focus);
  content: "";
}
.terminal-like-row.drop-before::before {
  top: -0.0625rem;
}
.terminal-like-row.drop-after::after {
  bottom: -0.0625rem;
}
</style>
