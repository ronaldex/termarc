<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "secondary" | "primary" | "danger";
    size?: "standard" | "compact";
  }>(),
  {
    variant: "secondary",
    size: "standard",
  },
);
</script>

<template>
  <button class="settings-button" :class="[variant, size]"><slot /></button>
</template>

<style scoped>
.settings-button {
  height: 2rem;
  flex: 0 0 auto;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-1);
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}
.settings-button.compact {
  height: 1.75rem;
  padding-inline: 0.625rem;
  font-size: 0.625rem;
}
.settings-button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.settings-button.primary {
  border-color: var(--color-accent-bg);
  color: var(--color-text-strong);
  background: var(--color-accent-bg);
}
.settings-button.danger {
  color: var(--color-status-error);
}
.settings-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
