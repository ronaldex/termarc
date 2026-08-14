<script setup lang="ts">
import { computed, ref, useSlots } from "vue";

const props = withDefaults(
  defineProps<{
    active: boolean;
    collapsed?: boolean;
    title?: string;
    ariaLabel?: string;
    shortcutVisible?: boolean;
    customContextMenu?: boolean;
  }>(),
  {
    collapsed: false,
    title: undefined,
    ariaLabel: undefined,
    shortcutVisible: false,
    customContextMenu: false,
  },
);

const emit = defineEmits<{
  select: [event: MouseEvent];
  doubleClick: [event: MouseEvent];
  keydown: [event: KeyboardEvent];
  contextMenu: [event: MouseEvent];
}>();

const slots = useSlots();
const selectButton = ref<HTMLButtonElement>();
const hasActions = computed(() => Boolean(slots.actions));

function handleContextMenu(event: MouseEvent): void {
  if (!props.customContextMenu) return;
  event.preventDefault();
  emit("contextMenu", event);
}

function getSelectButton(): HTMLButtonElement | undefined {
  return selectButton.value;
}

defineExpose({ getSelectButton });
</script>

<template>
  <div
    class="tree-item-row"
    :class="{
      'tree-active': active,
      compact: collapsed,
      'shortcut-visible': shortcutVisible && !collapsed,
    }"
    @contextmenu="handleContextMenu"
  >
    <button
      ref="selectButton"
      class="tree-item-select"
      :title="title"
      :aria-label="ariaLabel"
      @click="emit('select', $event)"
      @dblclick.stop="emit('doubleClick', $event)"
      @keydown="emit('keydown', $event)"
    >
      <span class="tree-item-icon"><slot name="icon" /></span>
      <span v-if="!collapsed" class="tree-item-content"><slot name="content" /></span>
      <span v-if="shortcutVisible && !collapsed" class="tree-item-shortcut">
        <slot name="shortcut" />
      </span>
    </button>
    <span v-if="hasActions && !collapsed" class="tree-item-actions">
      <slot name="actions" />
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
.tree-item-row {
  position: relative;
  display: flex;
  width: calc(100% + var(--tree-inline-start) + var(--tree-inline-end));
  box-sizing: border-box;
  min-height: 2.3125rem;
  align-items: center;
  padding: 0.25rem var(--tree-inline-end) 0.25rem
    calc(var(--tree-inline-start) + var(--tree-item-icon-left));
  margin-left: calc(-1 * var(--tree-inline-start));
  border-radius: 0;
  color: var(--color-text-subtle);
  --tree-row-primary-color: var(--color-text-muted);
}
.tree-item-row.tree-active {
  --tree-row-primary-color: var(--color-text-strong);
}
.tree-item-row:hover {
  background: color-mix(in srgb, var(--color-surface-hover) 18%, transparent);
}
.tree-item-row.tree-active::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0;
  width: 0.25rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background: var(--color-focus);
  content: "";
}
.tree-item-select {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: var(--tree-icon-column) minmax(0, 1fr) var(--tree-action-column);
  align-items: center;
  column-gap: var(--tree-column-gap);
  padding: 0;
  color: inherit;
  text-align: left;
}
.tree-item-icon {
  display: grid;
  width: var(--tree-item-icon-size);
  height: var(--tree-item-icon-size);
  place-items: center;
}
.tree-item-content {
  min-width: 0;
}
.tree-item-shortcut {
  width: 100%;
  grid-column: 3;
  color: var(--color-text-faint);
  font-size: 0.625rem;
  text-align: right;
}
.tree-item-actions {
  position: absolute;
  right: var(--tree-inline-end);
  display: flex;
  min-width: var(--tree-action-column);
  justify-content: flex-end;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.tree-item-row:not(.shortcut-visible):hover .tree-item-actions {
  opacity: 1;
  pointer-events: auto;
}
.tree-item-row.compact {
  width: 100%;
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
  margin-left: 0;
}
.tree-item-row.compact .tree-item-select {
  display: flex;
  flex: 0 0 auto;
}
.tree-item-row.compact.tree-active::before {
  left: 0;
}
</style>
