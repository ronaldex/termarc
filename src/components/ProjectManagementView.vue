<script setup lang="ts">
import type { Project } from "../types/project";

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
  <section class="projects-view">
    <header class="page-header">
      <strong>Projects</strong><span class="page-kind">Workspace settings</span>
    </header>

    <div class="page-content">
      <div class="section-heading">
        <span>PROJECTS</span>
        <button class="add-button" @click="emit('add')">＋ Add project</button>
      </div>
      <div class="project-card">
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
      </div>
    </div>
  </section>
</template>

<style scoped>
.projects-view {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--color-text);
  background: #111214;
}
.page-header {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 14px;
  padding: 0 22px;
  border-bottom: 1px solid var(--color-border);
  background: #111214;
}
.page-header strong {
  color: var(--color-text-strong);
  font-size: 12px;
}
.page-kind {
  padding-left: 14px;
  border-left: 1px solid #303238;
  color: var(--color-text-muted);
  font-size: 10px;
}
.page-content {
  width: min(760px, calc(100% - 44px));
  padding: 34px 0 48px;
  margin: 0 auto;
}
.section-heading {
  display: flex;
  height: 32px;
  align-items: start;
  justify-content: space-between;
  color: #8a8d95;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.05em;
}
button {
  font: inherit;
}
.add-button {
  height: 26px;
  margin-top: -8px;
  padding: 0 10px;
  border: 1px solid #3a3c42;
  border-radius: 5px;
  color: #d8d9dc;
  background: #1a1b1f;
  font-size: 10px;
  cursor: pointer;
}
.add-button:hover {
  border-color: #50535b;
  background: #202126;
}
.project-card {
  overflow: hidden;
  border: 1px solid #33353a;
  border-radius: 10px;
  background: #121315;
}
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
  font-family: "JetBrains Mono", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, monospace;
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
