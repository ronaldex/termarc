<script setup lang="ts">
import { useSlots } from "vue";

withDefaults(defineProps<{ title: string; danger?: boolean }>(), { danger: false });
const slots = useSlots();
</script>

<template>
  <section class="settings-section" :class="{ danger }">
    <header class="section-header" :class="{ 'has-action': slots.action }">
      <span>{{ title }}</span>
      <slot name="action" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.settings-section + .settings-section {
  margin-top: 1.5rem;
}
.settings-section.danger {
  margin-top: 2.5rem;
}
.section-header {
  display: flex;
  min-height: 1.75rem;
  align-items: flex-start;
  justify-content: space-between;
  color: var(--color-text-muted);
  font-size: 0.625rem;
  font-weight: 650;
  letter-spacing: 0.05em;
}
.section-header.has-action {
  min-height: 2.5rem;
  align-items: center;
}
</style>
