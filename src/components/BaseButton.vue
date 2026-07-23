<script setup lang="ts">
withDefaults(defineProps<{ variant?: "secondary" | "danger" }>(), {
  variant: "secondary",
});
</script>

<template>
  <button class="button" :class="variant"><slot /></button>
</template>

<style scoped>
.button {
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-1);
  font-size: 0.625rem;
  font-weight: 600;
  cursor: pointer;
  transition: 120ms ease;
}

.button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  color: var(--color-text-strong);
  background: var(--color-surface-2);
}

.button:disabled {
  opacity: 0.45;
  cursor: default;
}

.button.danger {
  border-color: var(--color-danger-bg);
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}

.button.danger:hover:not(:disabled) {
  border-color: var(--color-status-error);
  color: var(--color-status-error);
  background: var(--color-danger-bg);
}
</style>
