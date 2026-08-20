<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    variant?: "default" | "danger";
  }>(),
  { variant: "default" },
);
</script>

<template>
  <button
    type="button"
    class="tree-action"
    :class="variant"
    :title="title"
    :aria-label="title"
    @pointerdown.stop
  >
    <slot />
  </button>
</template>

<style scoped>
.tree-action {
  display: grid;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-emphasis);
  cursor: pointer;
}
.tree-action:hover {
  color: var(--color-text-strong);
  background: var(--color-surface-hover);
}
.tree-action.danger {
  color: var(--color-status-error);
}
.tree-action :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}
.tree-action :deep(.stroke-icon) {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.tree-action :deep(.fill-icon) {
  fill: currentColor;
}
</style>
