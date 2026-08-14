<script setup lang="ts">
import SettingsPage from "./settings/SettingsPage.vue";

defineProps<{
  title: string;
  kind: string;
  heading: string;
  description: string;
  actionLabel: string;
  icon?: string;
}>();
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <SettingsPage :title="title" :kind="kind" :show-edit-icon="false">
    <div class="action-content">
      <span class="action-icon" aria-hidden="true">{{ icon ?? "›_" }}</span>
      <h2>{{ heading }}</h2>
      <slot name="details" />
      <p>{{ description }}</p>
      <button class="primary" type="button" @click="emit('action')">▶ {{ actionLabel }}</button>
    </div>
  </SettingsPage>
</template>

<style scoped>
:deep(.page-content) {
  display: contents;
}
.action-content {
  display: flex;
  width: min(37.5rem, calc(100% - 2.75rem));
  min-height: calc(100% - 2.5rem);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 0 auto;
  text-align: center;
}
.action-icon {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  place-items: center;
  margin-bottom: 1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.875rem;
  color: var(--color-text);
  background: var(--color-surface-raised);
  font-family: "JetBrains Mono", monospace;
}
h2 {
  margin: 0 0 0.625rem;
  color: var(--color-text-strong);
  font-size: 1.0625rem;
}
p {
  margin: 0.75rem 0 1.125rem;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
}
button {
  height: 2rem;
  padding: 0 0.875rem;
  border: 1px solid var(--color-accent-bg);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-accent-bg);
  font-size: 0.625rem;
  cursor: pointer;
}
button:hover {
  border-color: var(--color-border-strong);
}
</style>
