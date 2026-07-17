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
  min-height: 64px;
  align-items: center;
  gap: 13px;
  padding: 10px 15px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.project-row + .project-row {
  border-top: 1px solid #33353a;
}
.project-row:hover {
  background: #17181b;
}
.badge {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 4px;
  color: #c6c8cd;
  background: #34373c;
  font-size: 8px;
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
  margin-bottom: 3px;
  color: #e0e1e4;
  font-size: 12px;
  font-weight: 500;
}
.details small {
  overflow: hidden;
  color: #9699a1;
  font-family:
    "Termdeck JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata {
  min-width: 58px;
  text-align: right;
}
.metadata strong {
  margin-bottom: 2px;
  color: #d8d9dc;
  font-size: 11px;
  font-weight: 500;
}
.metadata small {
  color: #777a82;
  font-size: 9px;
}
.project-row svg {
  width: 13px;
  height: 13px;
  margin-left: 8px;
  fill: none;
  stroke: #6e7178;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
</style>
