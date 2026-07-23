<script setup lang="ts">
import type { Project, ProjectCommand } from "../types/project";
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
  <section class="command-view">
    <header class="page-header">
      <strong>{{ project.name }}</strong>
      <span class="page-kind">Command</span>
    </header>

    <div class="command-content">
      <span class="command-icon" aria-hidden="true">›_</span>
      <h2>{{ command.name }}</h2>
      <code>{{ command.command }}</code>
      <div class="metadata">
        <span>{{ modeLabel() }}</span>
      </div>
      <p>Run this command in a terminal from {{ command.directory ?? project.directory }}.</p>
      <div class="actions">
        <button class="primary" @click="emit('run')">
          ▶ {{ command.mode === "single-shot" ? "Run" : "Start" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.command-view {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--color-text);
  background: var(--color-surface-0);
}
.page-header {
  display: flex;
  height: 2.5rem;
  align-items: center;
  gap: 0.875rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--color-border);
}
.page-header strong {
  color: var(--color-text-strong);
  font-size: 0.75rem;
}
.page-kind {
  padding-left: 0.875rem;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.625rem;
}
.command-content {
  display: flex;
  width: min(37.5rem, calc(100% - 2.75rem));
  min-height: calc(100% - 2.5rem);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 0 auto;
  text-align: center;
}
.command-icon {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  place-items: center;
  margin-bottom: 1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.875rem;
  color: var(--color-text);
  background: var(--color-surface-1);
  font-family: "JetBrains Mono", monospace;
}
h2 {
  margin: 0 0 0.625rem;
  color: var(--color-text-strong);
  font-size: 1.0625rem;
}
code {
  max-width: 100%;
  overflow: hidden;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-1);
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
  background: var(--color-surface-2);
  font-size: 0.5625rem;
  text-transform: capitalize;
}
p {
  margin: 0.75rem 0 1.125rem;
  color: var(--color-text-subtle);
  font-size: 0.625rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
button {
  height: 2rem;
  padding: 0 0.875rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.375rem;
  color: var(--color-text);
  background: var(--color-surface-1);
  font-size: 0.625rem;
  cursor: pointer;
}
button:hover {
  border-color: var(--color-border-strong);
}
.primary {
  border-color: var(--color-accent-bg);
  background: var(--color-accent-bg);
}
</style>
