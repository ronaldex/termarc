<script setup lang="ts">
import type { TerminalTab } from "../types/terminal";
defineProps<{ activeTab?: TerminalTab }>();
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <span class="app-title">Termdeck</span>
    <div class="active-terminal" data-tauri-drag-region>
      <span class="title-dot" :class="activeTab?.status ?? 'stopped'" />
      <strong>{{ activeTab?.title ?? "No terminal" }}</strong>
      <span>{{ activeTab?.detail ?? "Create a terminal to begin" }}</span>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 22px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--color-border);
  color: #b8c0d2;
  background: var(--color-sidebar-bg);
  user-select: none;
}
.app-title {
  margin-left: 72px;
  color: var(--color-text-strong);
  font-size: 12px;
  font-weight: 700;
}
.active-terminal {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.active-terminal span:last-child {
  overflow: hidden;
  color: #778196;
  font-family: monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #687087;
}
.title-dot.running {
  background: var(--color-status-running);
}
.title-dot.starting {
  background: var(--color-status-starting);
}
.title-dot.error {
  background: var(--color-status-error);
}
</style>
