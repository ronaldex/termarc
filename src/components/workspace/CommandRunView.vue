<script setup lang="ts">
import type { Project, ProjectCommand } from "../../types/project";
import WorkspaceActionView from "./WorkspaceActionView.vue";

const props = defineProps<{
  project: Project;
  command: ProjectCommand;
}>();
const emit = defineEmits<{ run: [] }>();
</script>

<template>
  <WorkspaceActionView
    :title="project.name"
    kind="Command"
    :heading="command.name"
    :description="`Run this command in a terminal from ${command.directory ?? project.directory}.`"
    action-label="Run"
    @action="emit('run')"
  >
    <template #details>
      <code>{{ command.command }}</code>
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
</style>
