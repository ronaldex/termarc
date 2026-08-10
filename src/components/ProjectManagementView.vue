<script setup lang="ts">
import type { Project } from "../types/project";
import SettingsButton from "./settings/SettingsButton.vue";
import SettingsCard from "./settings/SettingsCard.vue";
import SettingsPage from "./settings/SettingsPage.vue";
import SettingsSection from "./settings/SettingsSection.vue";

defineProps<{ projects: Project[] }>();
const emit = defineEmits<{ select: [project: Project]; add: [] }>();

function initials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
</script>

<template>
  <SettingsPage title="Projects" kind="Workspace settings" :show-edit-icon="false">
    <SettingsSection title="PROJECTS">
      <template #action>
        <SettingsButton type="button" @click="emit('add')">＋ Add project</SettingsButton>
      </template>
      <SettingsCard>
        <button
          v-for="project in projects"
          :key="project.id"
          class="project-row"
          @click="emit('select', project)"
        >
          <span class="badge">{{ initials(project.name) }}</span>
          <span class="details"
            ><strong>{{ project.name }}</strong
            ><small>{{ project.directory }}</small></span
          >
          <span class="metadata"
            ><strong>{{ project.commands?.length ?? 0 }}</strong
            ><small>Commands</small></span
          >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </SettingsCard>
    </SettingsSection>
  </SettingsPage>
</template>

<style scoped>
.project-row {
  display: flex;
  width: 100%;
  min-height: 4rem;
  align-items: center;
  gap: 0.875rem;
  padding: 0.625rem 1rem;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.project-row + .project-row {
  border-top: 1px solid var(--color-border);
}
.project-row:hover {
  background: var(--color-surface-raised);
}
.badge {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.25rem;
  color: var(--color-text);
  background: var(--color-surface-emphasis);
  font-size: 0.5rem;
  font-weight: 700;
}
.details {
  min-width: 0;
  flex: 1;
}
.details strong,
.details small,
.metadata strong,
.metadata small {
  display: block;
}
.details strong {
  margin-bottom: 0.25rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 500;
}
.details small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-family:
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 0.625rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata {
  min-width: 3.75rem;
  text-align: right;
}
.metadata strong {
  margin-bottom: 0.125rem;
  color: var(--color-text);
  font-size: 0.6875rem;
  font-weight: 500;
}
.metadata small {
  color: var(--color-text-subtle);
  font-size: 0.5625rem;
}
.project-row svg {
  width: 0.875rem;
  height: 0.875rem;
  margin-left: 0.5rem;
  fill: none;
  stroke: var(--color-text-subtle);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
</style>
