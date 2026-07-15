<script setup lang="ts">
import type { Project } from "../types/project";

defineProps<{ projects: Project[] }>();
const emit = defineEmits<{ select: [project: Project]; add: [] }>();
</script>

<template>
  <section class="projects-view">
    <header>
      <div>
        <span>WORKSPACE</span>
        <h1>Projects</h1>
        <p>Manage project directories and workspace settings.</p>
      </div>
      <button @click="emit('add')">＋ Add project</button>
    </header>
    <div class="project-table">
      <button
        v-for="project in projects"
        :key="project.id"
        class="project-card"
        @click="emit('select', project)"
      >
        <span class="badge">{{ project.name.slice(0, 2).toUpperCase() }}</span>
        <span class="details"
          ><strong>{{ project.name }}</strong
          ><small>{{ project.directory }}</small></span
        >
        <span class="command-count">{{ project.commands?.length ?? 0 }} commands</span>
        <span class="arrow">›</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.projects-view {
  width: min(760px, calc(100% - 64px));
  margin: 0 auto;
  padding: 54px 0;
  color: var(--color-text);
}
header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border);
}
header span {
  color: var(--color-text-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
h1 {
  margin: 8px 0 4px;
  color: var(--color-text-strong);
  font-size: 22px;
}
p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 11px;
}
header button {
  padding: 8px 12px;
  border: 1px solid #465b91;
  border-radius: 6px;
  color: var(--color-text-strong);
  background: #293b68;
  cursor: pointer;
}
.project-table {
  padding-top: 18px;
}
.project-card {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 13px;
  padding: 13px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.project-card:hover {
  background: #141821;
}
.badge {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  color: #c6c8cd;
  background: #34373c;
  font-size: 9px;
  font-weight: 700;
}
.details {
  min-width: 0;
  flex: 1;
}
.details strong,
.details small {
  display: block;
}
.details strong {
  margin-bottom: 3px;
  color: var(--color-text-strong);
  font-size: 12px;
}
.details small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-count {
  color: var(--color-text-muted);
  font-size: 10px;
}
.arrow {
  color: #696c73;
  font-size: 18px;
}
</style>
