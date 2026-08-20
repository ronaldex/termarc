<script setup lang="ts">
import AppButton from "../ui/AppButton.vue";

defineProps<{
  name: string;
  command: string;
  storage: "global" | "project";
  icon: string;
  removeLabel: string;
}>();

defineEmits<{
  edit: [];
  remove: [];
}>();
</script>

<template>
  <div class="process-row command-row">
    <button type="button" class="process-details command-details" @click="$emit('edit')">
      <span class="process-icon command-icon" aria-hidden="true">{{ icon }}</span>
      <span>
        <strong>{{ name }}</strong>
        <code>{{ command }}</code>
      </span>
    </button>
    <span class="process-storage command-storage">{{
      storage === "project" ? "Project" : "Global"
    }}</span>
    <AppButton type="button" variant="danger" :aria-label="removeLabel" @click="$emit('remove')">
      Remove
    </AppButton>
  </div>
</template>

<style scoped>
.process-row {
  display: flex;
  min-height: 4rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
}
.process-row + .process-row {
  border-top: 1px solid var(--color-border);
}
.process-details {
  display: flex;
  min-width: 0;
  height: auto;
  flex: 1;
  align-items: center;
  gap: 0.75rem;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.process-details > span:last-child {
  min-width: 0;
}
.process-details strong,
.process-details code {
  display: block;
}
.process-details strong {
  margin-bottom: 0.25rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 500;
}
.process-details code {
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.process-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-emphasis);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5625rem;
}
.process-storage {
  padding: 0.25rem 0.5rem;
  border-radius: 0.625rem;
  color: var(--color-terminal-cyan);
  background: var(--color-surface-active);
  font-size: 0.5625rem;
}
</style>
