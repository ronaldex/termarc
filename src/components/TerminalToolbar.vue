<script setup lang="ts">
import BaseButton from "./BaseButton.vue";
import type { TerminalTab } from "../types/terminal";

defineProps<{ activeTab?: TerminalTab }>();
const emit = defineEmits<{
  clear: [];
  restart: [];
  stop: [];
  toggleLeft: [];
  toggleRight: [];
}>();
</script>

<template>
  <header class="toolbar">
    <div class="terminal-title">
      <button
        class="panel-toggle"
        type="button"
        title="Toggle terminal sidebar"
        @click="emit('toggleLeft')"
      >
        ☰
      </button>
      <div class="status-dot" :class="activeTab?.status ?? 'stopped'" />
      <div>
        <strong>{{ activeTab?.title ?? "No terminal" }}</strong
        ><span>{{ activeTab?.detail ?? "Create a terminal to begin" }}</span>
      </div>
    </div>
    <div class="toolbar-actions">
      <BaseButton type="button" :disabled="!activeTab" @click="emit('clear')">Clear</BaseButton>
      <BaseButton
        type="button"
        :disabled="!activeTab || activeTab.status === 'starting'"
        @click="emit('restart')"
        >Restart</BaseButton
      >
      <BaseButton
        variant="danger"
        type="button"
        :disabled="!activeTab?.session || activeTab.status === 'starting'"
        @click="emit('stop')"
        >Stop</BaseButton
      >
      <button
        class="panel-toggle"
        type="button"
        title="Toggle Git changes sidebar"
        @click="emit('toggleRight')"
      >
        ▧
      </button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 18px;
  border-bottom: 1px solid #20232d;
  background: #10131a;
}
.terminal-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.terminal-title strong,
.terminal-title span {
  display: block;
}
.terminal-title strong {
  color: #e6eaf2;
  font-size: 12px;
}
.terminal-title span {
  max-width: 420px;
  overflow: hidden;
  margin-top: 2px;
  color: #778196;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #687087;
  box-shadow: 0 0 0 3px #6870871a;
}
.status-dot.starting {
  background: #e0af68;
  box-shadow: 0 0 0 3px #e0af681a;
  animation: terminal-pulse 1.2s ease-in-out infinite;
}
.status-dot.running {
  background: #9ece6a;
  box-shadow: 0 0 0 3px #9ece6a1a;
}
.status-dot.stopped {
  background: #687087;
}
.status-dot.error {
  background: #f7768e;
  box-shadow: 0 0 0 3px #f7768e1a;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}
.panel-toggle {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid #303645;
  border-radius: 6px;
  color: #aeb7ca;
  background: #191d27;
  cursor: pointer;
}
.panel-toggle:hover {
  color: #eef2fa;
  background: #242a38;
}
.renderer-badge {
  margin-right: 5px;
  padding: 4px 7px;
  border: 1px solid #25414a;
  border-radius: 5px;
  color: #80c9d8;
  background: #12252b;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.renderer-badge.fallback {
  border-color: #493d27;
  color: #d5ad68;
  background: #282216;
}
@keyframes terminal-pulse {
  50% {
    opacity: 0.45;
  }
}
@media (max-width: 720px) {
  .renderer-badge {
    display: none;
  }
}
</style>
