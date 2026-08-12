<script setup lang="ts">
import { computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TerminalTabState } from "../types/terminal";
import { terminalDisplayModel } from "../utils/terminalLabels";
import TerminalStatusIndicator from "./TerminalStatusIndicator.vue";

const props = defineProps<{ activeTab?: TerminalTabState; macos: boolean }>();
const currentWindow = getCurrentWindow();

function minimize(): void {
  void currentWindow.minimize();
}

function toggleMaximize(): void {
  void currentWindow.toggleMaximize();
}

function close(): void {
  void currentWindow.close();
}
const display = computed(() =>
  props.activeTab ? terminalDisplayModel(props.activeTab) : undefined,
);
</script>

<template>
  <header class="titlebar" :class="{ macos }" data-tauri-drag-region>
    <span class="app-title">Termarc</span>
    <div class="active-terminal">
      <TerminalStatusIndicator
        :status="activeTab?.status ?? 'stopped'"
        :busy="display?.busy"
        :running="display?.running"
        variant="titlebar"
      />
      <strong>{{ display?.primaryLabel ?? "No terminal" }}</strong>
      <span>{{
        display?.secondaryLabel ?? activeTab?.detail ?? "Create a terminal to begin"
      }}</span>
    </div>
    <div v-if="!macos" class="window-controls" data-tauri-drag-region="false">
      <button type="button" aria-label="Minimize" @click.stop="minimize">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
      </button>
      <button type="button" aria-label="Maximize" @click.stop="toggleMaximize">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
        </svg>
      </button>
      <button type="button" aria-label="Close" @click.stop="close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  min-height: var(--titlebar-height);
  grid-column: 1 / -1;
  align-items: center;
  gap: 1.5rem;
  padding: 0 0.75rem 0 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-sidebar-bg);
  user-select: none;
}
.titlebar * {
  pointer-events: none;
}
.app-title {
  flex: 0 0 auto;
  margin-left: 0;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  font-weight: 700;
}
.titlebar.macos .app-title {
  margin-left: 72px;
}
.active-terminal {
  display: flex;
  overflow: hidden;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
}
.active-terminal strong,
.active-terminal span:last-child {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.active-terminal strong {
  flex: 0 1 auto;
  color: var(--color-text-strong);
}
.active-terminal span:last-child {
  flex: 1;
  color: var(--color-text-subtle);
  font-family:
    "Termarc JetBrainsMono Nerd Font", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
.window-controls {
  display: flex;
  pointer-events: auto;
}
.window-controls button {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0.25rem 0.2rem;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 999px;
  color: var(--color-text-subtle);
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transition:
    color 120ms ease,
    background 120ms ease;
}
.window-controls svg {
  width: 0.8rem;
  height: 0.8rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
}
.window-controls button:last-child {
  color: var(--color-text-strong);
  background: rgb(255 255 255 / 10%);
  margin-right: 0;
}
.window-controls button:hover {
  color: var(--color-text-strong);
  background: rgb(255 255 255 / 16%);
}
.window-controls button:active {
  background: var(--color-border-muted);
}
.window-controls button:last-child:hover {
  color: var(--color-text-strong);
  background: rgb(255 255 255 / 20%);
}
</style>
