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
  height: 31px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid #3a3c42;
  border-radius: 6px;
  color: #d8d9dc;
  background: #1a1b1f;
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}
.settings-button.compact {
  height: 27px;
  padding-inline: 10px;
  font-size: 0.625rem;
}
.settings-button:hover:not(:disabled) {
  border-color: #50535b;
  background: #202126;
}
.settings-button.primary {
  border-color: #48536f;
  color: #eceef4;
  background: #293149;
}
.settings-button.danger {
  color: #e78a91;
}
.settings-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
