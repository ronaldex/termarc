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
  background: #111214;
}
.page-header {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 14px;
  padding: 0 22px;
  border-bottom: 1px solid var(--color-border);
}
.page-header strong {
  color: var(--color-text-strong);
  font-size: 0.75rem;
}
.page-kind {
  padding-left: 14px;
  border-left: 1px solid #303238;
  color: var(--color-text-muted);
  font-size: 0.625rem;
}
.command-content {
  display: flex;
  width: min(600px, calc(100% - 44px));
  min-height: calc(100% - 38px);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 0 auto;
  text-align: center;
}
.command-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 16px;
  border: 1px solid #30394e;
  border-radius: 13px;
  color: #aeb8d1;
  background: #171c28;
  font-family: "JetBrains Mono", monospace;
}
h2 {
  margin: 0 0 10px;
  color: #e0e2e7;
  font-size: 1.0625rem;
}
code {
  max-width: 100%;
  overflow: hidden;
  padding: 7px 10px;
  border: 1px solid #30333a;
  border-radius: 6px;
  color: #b7bbc5;
  background: #17181b;
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata {
  display: flex;
  gap: 7px;
  margin-top: 13px;
}
.metadata span {
  padding: 4px 7px;
  border-radius: 10px;
  color: #9298a6;
  background: #22252d;
  font-size: 0.5625rem;
  text-transform: capitalize;
}
p {
  margin: 12px 0 18px;
  color: #747985;
  font-size: 0.625rem;
}
.actions {
  display: flex;
  gap: 8px;
}
button {
  height: 32px;
  padding: 0 13px;
  border: 1px solid #3a3e47;
  border-radius: 6px;
  color: #d5d7dc;
  background: #1a1c21;
  font-size: 0.625rem;
  cursor: pointer;
}
button:hover {
  border-color: #555b68;
}
.primary {
  border-color: #4b5876;
  background: #293149;
}
</style>
