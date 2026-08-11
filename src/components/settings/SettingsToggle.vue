<script setup lang="ts">
defineProps<{
  checked: boolean;
  disabled?: boolean;
  label: string;
}>();

defineEmits<{
  change: [event: Event];
}>();
</script>

<template>
  <input
    class="settings-toggle"
    type="checkbox"
    :checked="checked"
    :disabled="disabled"
    :aria-label="label"
    @change="$emit('change', $event)"
  />
</template>

<style scoped>
.settings-toggle {
  --toggle-width: 2rem;
  --toggle-height: 1.125rem;
  --toggle-padding: 0.125rem;
  position: relative;
  width: var(--toggle-width);
  height: var(--toggle-height);
  justify-self: start;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--toggle-height);
  appearance: none;
  background: var(--color-surface-emphasis);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}
.settings-toggle::after {
  position: absolute;
  top: var(--toggle-padding);
  left: var(--toggle-padding);
  width: calc(var(--toggle-height) - var(--toggle-padding) - var(--toggle-padding) - 2px);
  height: calc(var(--toggle-height) - var(--toggle-padding) - var(--toggle-padding) - 2px);
  border-radius: 50%;
  background: var(--color-text-muted);
  content: "";
  transition:
    transform 120ms ease,
    background 120ms ease;
}
.settings-toggle:checked {
  border-color: var(--color-accent);
  background: var(--color-accent);
}
.settings-toggle:checked::after {
  background: var(--color-app-bg);
  transform: translateX(calc(var(--toggle-width) - var(--toggle-height)));
}
.settings-toggle:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.settings-toggle:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
