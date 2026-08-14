<script setup lang="ts">
import type { Project } from "../types/project";
import WorkspaceActionView from "./WorkspaceActionView.vue";

defineProps<{ project: Project }>();
const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <WorkspaceActionView
    :title="project.name"
    kind="Terminal"
    heading="Terminal is stopped"
    description="Start it to resume this shell"
    action-label="Start terminal"
    @action="emit('start')"
  />
</template>
