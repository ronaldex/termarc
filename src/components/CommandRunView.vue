<script setup lang="ts">
import type { Project, ProjectCommand } from "../types/project";
import WorkspaceActionView from "./WorkspaceActionView.vue";

const props = defineProps<{
  project: Project;
  command: ProjectCommand;
}>();
const emit = defineEmits<{ run: [] }>();

function modeLabel(): string {
  return props.command.mode === "single-shot" ? "One shot" : "Continuous";
}
</script>

<template>
  <WorkspaceActionView
    :title="project.name"
    kind="Command"
    :heading="command.name"
    :description="`Run this command in a terminal from ${command.directory ?? project.directory}.`"
    :action-label="command.mode === 'single-shot' ? 'Run' : 'Start'"
    @action="emit('run')"
  >
    <template #details>
      <code>{{ command.command }}</code>
      <div class="metadata">
        <span>{{ modeLabel() }}</span>
      </div>
    </template>
  </WorkspaceActionView>
</template>

<style scoped>
code {
  max-width: 100%;
  overflow: hidden;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-raised);
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.875rem;
}
.metadata span {
  padding: 0.25rem 0.5rem;
  border-radius: 0.625rem;
  color: var(--color-text-muted);
  background: var(--color-surface-active);
  font-size: 0.5625rem;
  text-transform: capitalize;
}
</style>
