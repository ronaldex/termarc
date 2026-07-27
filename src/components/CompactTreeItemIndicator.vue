<script setup lang="ts">
defineProps<{ shortcutNumber?: number }>();
</script>

<template>
  <span class="compact-tree-item-indicator">
    <slot />
    <span v-if="shortcutNumber" class="shortcut" aria-hidden="true">⌘{{ shortcutNumber }}</span>
  </span>
</template>

<style scoped>
.compact-tree-item-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--compact-tree-suffix-gap, 0.125rem);
}
.shortcut {
  display: grid;
  width: 1.25rem;
  height: var(--compact-tree-icon-width, 0.75rem);
  place-items: center;
  color: var(--color-text-faint);
  font-size: 0.625rem;
  line-height: 1;
}
</style>
