<script setup lang="ts">
import type { Project } from "../../types/project";
import WorkspaceActionView from "../workspace/WorkspaceActionView.vue";

withDefaults(
  defineProps<{
    project: Project;
    kind?: string;
    heading?: string;
    actionLabel?: string;
  }>(),
  {
    kind: "Terminal",
    heading: "Terminal is stopped",
    actionLabel: "Start terminal",
  },
);
const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <WorkspaceActionView
    :title="project.name"
    :kind="kind"
    :heading="heading"
    description="Start it to resume this process"
    :action-label="actionLabel"
    @action="emit('start')"
  />
</template>
