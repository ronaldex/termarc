<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "secondary" | "primary" | "danger" | "ghost";
    size?: "standard" | "compact";
  }>(),
  {
    variant: "secondary",
    size: "standard",
  },
);
</script>

<template>
  <button class="app-button" :class="[variant, size]"><slot /></button>
</template>

<style scoped>
.app-button {
  height: 2rem;
  flex: 0 0 auto;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-raised);
  font: inherit;
  font-size: 0.6875rem;
  font-weight: 600;
  cursor: pointer;
  transition: 120ms ease;
}
.app-button.compact {
  height: 1.75rem;
  padding-inline: 0.625rem;
  font-size: 0.625rem;
}
.app-button:hover:not(:disabled) {
  color: var(--color-text-strong);
  background: var(--color-surface-active);
}
.app-button.primary {
  border-color: var(--color-accent-bg);
  color: var(--color-text-strong);
  background: var(--color-accent-bg);
}
.app-button.danger {
  color: var(--color-status-error);
}
.app-button.ghost {
  border-color: transparent;
  background: transparent;
}
.app-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.app-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
